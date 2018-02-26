const Debug = require('debug');
require('babel-polyfill');
const FormData = require('form-data');
const uuidV4 = require('uuid/v4');
const xml2js = require('xml2js-es6-promise');
const json2xml = require('json2xml');
const fetch = require('node-fetch');
const qs = require('qs');
const hash = require('hash.js');
const request = require('request-promise');
const devnull = require('dev-null');
const through2 = require('through2');
const utils = require('./utils');
const { getAppBinaryFieldName, waitFor } = require('./utils');

const debug = Debug('iexec-server-js-client');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const createIEXECClient = ({
  login = '',
  password = '',
  server = '',
  jwt = '',
  mandated = '',
}) => {
  const BASICAUTH_CREDENTIALS = Buffer.from(login.concat(':', password)).toString('base64');
  const STATE_AUTH = {};
  let mandatedLogin = mandated;
  const APPS = {};
  const hostname = server.split('://')[1].split(':')[0];
  const uri2uid = uri => uri.split(`xw://${hostname}/`)[1];
  const uid2uri = uid => `xw://${hostname}/${uid}`;

  const xmlFormat = async (res) => {
    const xmlResponse = await res.text();
    debug('xmlResponse', xmlResponse);
    const jsResponse = await xml2js(xmlResponse);
    debug('jsResponse', jsResponse);
    return jsResponse;
  };
  const streamFormat = res => res;

  const http = method => async (endpoint, {
    uid = '', params = {}, body = undefined, format = xmlFormat,
  } = {}) => {
    try {
      const MANDATED = mandatedLogin !== '' ? { XWMANDATINGLOGIN: mandatedLogin } : {};
      const allParams = Object.assign({}, params, STATE_AUTH, MANDATED);
      const queryString = Object.keys(allParams).length !== 0 ? '?'.concat(qs.stringify(allParams)) : '';
      const uri = server.concat('/', endpoint, uid ? '/' : '', uid, queryString);
      const headers = { Authorization: 'Basic '.concat(BASICAUTH_CREDENTIALS) };

      debug(method, uri);
      const res = await fetch(uri, {
        method,
        body,
        headers,
      });
      return format(res);
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
      const url = server.concat('/ethauth/');
      const jarCookie = request.cookie(`ethauthtoken=${jwtoken}`);
      jar.setCookie(jarCookie, url);
      await request({ url, jar });
      const cookie = jar.getCookies(url).find(e => e.key === 'state');
      if (!cookie) throw Error('getCookieByJWT() jwt auth failed');

      STATE_AUTH.state = cookie.value;
      debug('cookie.value', cookie.value);
      return cookie.value;
    } catch (error) {
      debug('getCookieByJWT()', error);
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
  const download = uid => get('downloaddata', { uid });
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

  const defaultApp = { accessrights: '0x1700', type: 'DEPLOYABLE' };
  const defaultData = { accessrights: '0x1700', name: 'fileName', status: 'UNAVAILABLE' };
  const defaultWork = { accessrights: '0x1700', status: 'UNAVAILABLE' };
  const createXMLApp = app => `<app>${json2xml(Object.assign(defaultApp, app))}</app>`;
  const createXMLData = data => `<data>${json2xml(Object.assign(defaultData, data))}</data>`;
  const createXMLWork = work => `<work>${json2xml(Object.assign(defaultWork, work))}</work>`;

  const registerData = async (data, size, dataParams = {}) => {
    const dataUID = uuidV4();
    debug('dataUID', dataUID);
    await sendData(createXMLData(Object.assign(dataParams, { uid: dataUID })));
    await uploadData(dataUID, data, size);
    return dataUID;
  };

  const registerApp = async (appParams = {}) => {
    const appUID = uuidV4();
    debug('appUID', appUID);
    await sendApp(createXMLApp(Object.assign({ uid: appUID }, appParams)));
    return appUID;
  };

  const submitWork = async (appUID, params = {}) => {
    const workUID = uuidV4();
    debug('workUID', workUID);
    await sendWork(createXMLWork(Object.assign(params, { uid: workUID, appuid: appUID })));
    await sendWork(createXMLWork(Object.assign(params, { uid: workUID, appuid: appUID })));
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

  const submitWorkByAppName = async (appName, params = {}) => {
    if (!(appName in APPS)) await updateAppsCache();
    if (!(appName in APPS)) throw Error(`No match for App name ${appName}`);
    const appUID = APPS[appName];
    debug('appUID', appUID, 'from name', appName);
    return submitWork(appUID, params);
  };

  const downloadStream = (uid, stream = '') => new Promise(async (resolve, reject) => {
    const res = await get('downloaddata', { uid, format: streamFormat });

    let buff = Buffer.from('', 'utf8');
    let full = false;
    const bufferSize = 1 * 1024;
    const outputStream = stream === '' ? devnull() : stream;

    res.body
      .pipe(through2((chunk, enc, cb) => {
        if (!full) {
          buff = Buffer.concat([buff, chunk]);
          if (buff.length >= bufferSize) {
            debug('Buffer limit reached', buff.length);
            full = true;
          }
        }
        cb(null, chunk);
      }))
      .on('error', reject)
      .pipe(outputStream)
      .on('error', reject)
      .on('finish', () => {
        debug('finish event');
        debug('buff.length', buff.length);
        debug('buff.slice(0, bufferSize).length', buff.slice(0, bufferSize).length);
        resolve({ stdout: buff.slice(0, bufferSize).toString() });
      });
  });

  const init = async () => {
    if (jwt) await getCookieByJWT(jwt);
    await updateAppsCache();
  };

  return Object.assign({
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
    downloadStream,
    uploadData,
    registerData,
    registerApp,
    submitWork,
    submitWorkByAppName,
    waitForWorkCompleted,
    uri2uid,
    uid2uri,
    getAppBinaryFieldName,
  }, utils);
};
module.exports = createIEXECClient;
