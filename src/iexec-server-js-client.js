const Debug = require('debug');
const uuidV4 = require('uuid/v4');
const xml2js = require('xml2js-es6-promise');
const json2xml = require('jsontoxml');
const fetch = require('cross-fetch');
const qs = require('qs');
const devnull = require('dev-null');
const through2 = require('through2');
const utils = require('./utils');
const { getAppBinaryFieldName, waitFor } = require('./utils');

const debug = Debug('iexec-server-js-client');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const createIEXECClient = ({
  login = '',
  password = '',
  server,
  jwt = '',
  mandated = '',
  cookie = '',
  authURL = 'https://auth.iex.ec',
}) => {
  if (!server) throw Error('missing server address, cannot be undefined');

  const BASICAUTH_CREDENTIALS = login
    ? Buffer.from(login.concat(':', password)).toString('base64')
    : undefined;

  const STATE_AUTH = cookie ? { state: cookie } : {};
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
  const textFormat = res => res.text();

  const resFormatPresets = {
    xml: xmlFormat,
    stream: streamFormat,
    text: textFormat,
  };

  const http = method => async (
    endpoint,
    {
      uid = '', params = {}, body = undefined, format = xmlFormat,
    } = {},
  ) => {
    try {
      const MANDATED = mandatedLogin !== '' ? { XWMANDATINGLOGIN: mandatedLogin } : {};
      const allParams = Object.assign({}, params, STATE_AUTH, MANDATED);
      const queryString = Object.keys(allParams).length !== 0 ? '?'.concat(qs.stringify(allParams)) : '';
      const uri = server.concat('/', endpoint, uid ? '/' : '', uid, queryString);
      const headers = BASICAUTH_CREDENTIALS
        ? { Authorization: 'Basic '.concat(BASICAUTH_CREDENTIALS) }
        : {};

      debug(method, uri);
      const res = await fetch(uri, {
        method,
        body,
        headers,
      });
      const formatFn = typeof format === 'string' ? resFormatPresets[format] : format;
      return formatFn(res);
    } catch (error) {
      debug('http', error);
      throw error;
    }
  };
  const get = http('GET');
  const post = http('POST');

  const getCookieByJWT = async (jwtoken) => {
    try {
      const authCookie = await get('ethauth/', {
        params: { ethauthtoken: jwtoken, noredirect: 'true' },
        format: streamFormat,
      }).then(res => res.text());
      debug('authCookie', authCookie);
      STATE_AUTH.state = authCookie;
      return authCookie;
    } catch (error) {
      debug('getCookieByJWT()', error);
      throw Error;
    }
  };

  function setMandated(mandatedUser) {
    mandatedLogin = mandatedUser;
  }

  const getByUID = uid => get('get', { uid });
  const getUID = (uid) => {
    console.log('deprecated, use getByUID() instead');
    return getByUID(uid);
  };
  const removeByUID = uid => get('remove', { uid });
  const removeUID = (uid) => {
    console.log('deprecated, use removeByUID() instead');
    return removeByUID(uid);
  };
  const getAppByName = uid => get('getappbyname', { uid });
  const getAppsUIDs = () => get('getapps').then(uids => uids.xwhep.XMLVector[0].XMLVALUE.map(e => e.$.value));
  const getAppsByUIDs = appsUIDs => Promise.all(appsUIDs.map(uid => getUID(uid)));
  const getWorkByExternalID = uid => get('getworkbyexternalid', { uid });
  const sendData = xmlData => get('senddata', { params: { XMLDESC: xmlData } });
  const sendApp = xmlApp => get('sendapp', { params: { XMLDESC: xmlApp } });
  const sendWork = xmlWork => get('sendwork', { params: { XMLDESC: xmlWork } });
  const download = (uid, options) => get('downloaddata', Object.assign({ uid }, options));

  const createDownloadURI = workResultURI => server.concat(`/downloaddata/${uri2uid(workResultURI)}?state=${STATE_AUTH.state}`);

  const defaultApp = { accessrights: '0x1700', type: 'DEPLOYABLE' };
  const defaultWork = { accessrights: '0x1700', status: 'UNAVAILABLE' };
  const createXMLApp = app => `<app>${json2xml(Object.assign(defaultApp, app))}</app>`;
  const createXMLWork = work => `<work>${json2xml(Object.assign(defaultWork, work))}</work>`;

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
    const app = await getAppByName(appName);
    const appUID = utils.getFieldValue(app, 'uid');
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
      .pipe(
        through2((chunk, enc, cb) => {
          if (!full) {
            buff = Buffer.concat([buff, chunk]);
            if (buff.length >= bufferSize) {
              debug('Buffer limit reached', buff.length);
              full = true;
            }
          }
          cb(null, chunk);
        }),
      )
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

  const getTypedMessage = () => fetch(`${authURL}/typedmessage`).then(res => res.json());
  const getJWTBySignature = (msgJSON, address, signResult, { type = 'typedauth' } = {}) => fetch(`${authURL}/${type}?message=${msgJSON}&address=${address}&signature=${signResult}`).then(
    res => res.json(),
  );

  return Object.assign(
    {
      server,
      state: STATE_AUTH,
      init,
      get,
      post,
      getCookieByJWT,
      setMandated,
      getByUID,
      getUID,
      removeByUID,
      removeUID,
      getAppByName,
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
      createDownloadURI,
      registerApp,
      submitWork,
      submitWorkByAppName,
      waitForWorkCompleted,
      uri2uid,
      uid2uri,
      getAppBinaryFieldName,
      getTypedMessage,
      getJWTBySignature,
    },
    utils,
  );
};
module.exports = createIEXECClient;
