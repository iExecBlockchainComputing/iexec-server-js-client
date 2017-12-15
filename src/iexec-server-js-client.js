const Debug = require('debug');
const FormData = require('form-data');
const uuidV4 = require('uuid/v4');
const xml2js = require('xml2js-es6-promise');
const json2xml = require('json2xml');
const fetch = require('node-fetch');
const qs = require('qs');
const hash = require('hash.js');
const request = require('request-promise');
const { getAppBinaryFieldName, waitFor } = require('./utils');

const debug = Debug('iexec-server-js-client');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const createIEXECClient = ({
  login = '',
  password = '',
  hostname = '',
  port = '',
  jwt = '',
  mandated = '',
}) => {
  const BASICAUTH_CREDENTIALS = Buffer.from(login.concat(':', password)).toString('base64');
  const BASE_URL = 'https://'.concat(hostname, ':', port, '/');
  const STATE_AUTH = {};
  let mandatedLogin = mandated;
  const APPS = {};

  const http = method => async (endpoint, { uid = '', params = {}, body = {} } = {}) => {
    try {
      const MANDATED = mandatedLogin !== '' ? { XWMANDATINGLOGIN: mandatedLogin } : {};
      const allParams = Object.assign({}, params, STATE_AUTH, MANDATED);
      const queryString = Object.keys(allParams).length !== 0 ? '?'.concat(qs.stringify(allParams)) : '';
      const uri = BASE_URL.concat(endpoint, uid ? '/' : '', uid, queryString);
      const headers = { Authorization: 'Basic '.concat(BASICAUTH_CREDENTIALS) };

      debug(method, uri);
      const xmlResponse = await fetch(uri, {
        method,
        body,
        headers,
      }).then(res => res.text());
      debug(method, 'xmlResponse', xmlResponse);
      const jsResponse = await xml2js(xmlResponse);
      debug(method, 'jsResponse', jsResponse);

      return jsResponse;
    } catch (error) {
      debug('http', error);
      throw error;
    }
  };
  const get = http('GET');
  const post = http('POST');

  const getCookieByJWT = async (jwtoken) => {
    try {
      const jar = request.jar();
      const url = 'https://'.concat(hostname, ':', port, '/ethauth/');
      const jarCookie = request.cookie(`ethauthtoken=${jwtoken}`);
      jar.setCookie(jarCookie, url);
      await request({ url, jar });
      const cookie = jar.getCookies(url).find(e => e.key === 'state');
      if (!cookie) throw Error('getCookieByJWT() jwt auth failed');

      STATE_AUTH.state = cookie.value;
      debug('cookie.value', cookie.value);
      return cookie.value;
    } catch (error) {
      debug('error', error);
      throw Error;
    }
  };

  function setMandated(mandatedUser) { mandatedLogin = mandatedUser; }

  const getUID = uid => get('get', { uid });
  const removeUID = uid => get('remove', { uid });
  const getAppsUIDs = () => get('getapps').then(uids => uids.xwhep.XMLVector[0].XMLVALUE.map(e => e.$.value));
  const getAppsByUIDs = appsUIDs => Promise.all(appsUIDs.map(uid => getUID(uid)));
  const getWorkByExternalID = uid => get('getworkbyexternalid', { uid });
  const sendData = xmlData => get('senddata', { params: { XMLDESC: xmlData } });
  const sendApp = xmlApp => get('sendapp', { params: { XMLDESC: xmlApp } });
  const sendWork = xmlWork => get('sendwork', { params: { XMLDESC: xmlWork } });
  const download = uid => get('download', { uid });
  const uploadData = (uid, data, size) => {
    const form = new FormData();
    form.append('DATAUID', uid);
    const sha256 = hash.sha256().update(data).digest('hex');
    debug('sha256', sha256);
    form.append('DATAMD5SUM', sha256);
    form.append('DATASIZE', size);
    form.append('DATAFILE', data);
    return post('uploaddata', { uid, body: form });
  };

  const createApp = (uid, name, extraFields = {}) => `<app><uid>${uid}</uid><name>${name}</name><type>DEPLOYABLE</type><accessrights>0x755</accessrights>${json2xml(extraFields)}</app>`;
  const createData = (uid, type, cpu, os) => `<data><uid>${uid}</uid><accessrights>0x755</accessrights><type>${type}</type><name>fileName</name><cpu>${cpu}</cpu><os>${os}</os><status>UNAVAILABLE</status></data>`;
  const createWork = (uid, appuid, sgid) => `<work><uid>${uid}</uid><accessrights>0x755</accessrights><appuid>${appuid}</appuid><sgid>${sgid}</sgid><status>UNAVAILABLE</status></work>`;

  const registerApp = async (data, type, cpu, os, size, name) => {
    const dataUID = uuidV4();
    debug('dataUID', dataUID);
    await sendData(createData(dataUID, type, cpu, os));
    await uploadData(dataUID, data, size);
    const fields = {};
    fields[getAppBinaryFieldName(os, cpu)] = 'xw://xwserver/'.concat(dataUID);
    const appUID = uuidV4();
    debug('appUID', appUID);
    await sendApp(createApp(appUID, name, fields));
    return appUID;
  };

  const submitWork = async (appUID, sgid) => {
    const workUID = uuidV4();
    debug('workUID', workUID);
    await sendWork(createWork(workUID, appUID, sgid));
    await sendWork(createWork(workUID, appUID, sgid));
    const work = await getUID(workUID);
    debug('work.xwhep.work[0].status[0]', work.xwhep.work[0].status[0]);
    work.xwhep.work[0].status[0] = 'PENDING';
    await sendWork(json2xml(work));
    return workUID;
  };

  const waitForWorkCompleted = async workUID => waitFor(getUID, workUID);

  const appsToCache = apps => apps.forEach((app) => {
    const appUID = app.xwhep.app[0].uid[0];
    APPS[app.xwhep.app[0].name[0]] = appUID;
  });

  const updateAppsCache = async () => {
    const appsUIDs = await getAppsUIDs();
    const cacheAppsUIDs = Object.keys(APPS).map(name => APPS[name]);
    debug('cacheAppsUIDs', cacheAppsUIDs);
    const notCachedUIDs = appsUIDs.filter(uid => !cacheAppsUIDs.includes(uid));
    debug('notCachedUIDs', notCachedUIDs);
    const notCachedApps = await getAppsByUIDs(notCachedUIDs);
    appsToCache(notCachedApps);
  };

  const submitWorkByAppName = async (appName, sgid) => {
    if (!(appName in APPS)) await updateAppsCache();
    if (!(appName in APPS)) throw Error(`No match for App name ${appName}`);
    const appUID = APPS[appName];
    debug('appUID', appUID, 'from name', appName);
    return submitWork(appUID, sgid);
  };

  const init = async () => {
    if (jwt) await getCookieByJWT(jwt);
    await updateAppsCache();
  };

  return {
    init,
    get,
    post,
    getCookieByJWT,
    setMandated,
    getUID,
    removeUID,
    getAppsUIDs,
    getAppsByUIDs,
    appsToCache,
    updateAppsCache,
    getWorkByExternalID,
    sendWork,
    sendData,
    sendApp,
    download,
    uploadData,
    createWork,
    registerApp,
    submitWork,
    submitWorkByAppName,
    waitForWorkCompleted,
  };
};
module.exports = createIEXECClient;
