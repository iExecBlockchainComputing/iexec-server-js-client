const Debug = require('debug');

const debug = Debug('iexec-server-js-client:utils');

const getAppBinaryFieldName = (_os, _cpu) => {
  if (_os === undefined || _cpu === undefined) {
    throw new Error('OS or CPU undefined');
  }

  const os = _os.toUpperCase();
  const cpu = _cpu.toUpperCase();

  if (os === 'JAVA') {
    return 'javauri';
  }

  switch (os) {
    case 'LINUX':
      switch (cpu) {
        case 'IX86':
          return 'linux_ix86uri';
        case 'PPC':
          return 'linux_ppcuri';
        case 'AMD64':
          return 'linux_amd64uri';
        case 'X86_64':
          return 'linux_x86_64uri';
        case 'IA64':
          return 'linux_ia64uri';
        default:
          break;
      }
      break;
    case 'WIN32':
      switch (cpu) {
        case 'IX86':
          return 'win32_ix86uri';
        case 'AMD64':
          return 'win32_amd64uri';
        case 'X86_64':
          return 'win32_x86_64uri';
        default:
          break;
      }
      break;
    case 'MACOSX':
      switch (cpu) {
        case 'IX86':
          return 'macos_ix86uri';
        case 'X86_64':
          return 'macos_x86_64uri';
        case 'PPC':
          return 'macos_ppcuri';
        default:
          break;
      }
      break;
    default:
      break;
  }
  return undefined;
};

const getFieldValue = (obj, field) => {
  const [objName] = Object.keys(obj.xwhep);
  const fields = Object.keys(obj.xwhep[objName][0]);
  if (!fields.includes(field)) throw Error(`getFieldValue() no ${field} in ${objName}`);
  return obj.xwhep[objName][0][field][0];
};

const FETCH_INTERVAL = 5000;
const sleep = ms => new Promise(res => setTimeout(res, ms));

const waitFor = async (fn, uid, counter = 0) => {
  try {
    const work = await fn(uid);
    debug('waitFor()', counter, uid, 'status', work.xwhep.work[0].status[0]);
    const status = getFieldValue(work, 'status');
    if (status === 'COMPLETED') return work;
    if (status === 'ERROR') throw Error('Work status = ERROR');
    await sleep(FETCH_INTERVAL);
    return waitFor(fn, uid, counter + 1);
  } catch (error) {
    debug('waitFor()', uid, error);
    throw error;
  }
};

const waitForWorkResult = async (fn, txHash, counter = 0) => {
  const workResult = await fn(txHash);

  debug('counter', counter);
  debug('workResult', workResult);
  const status = workResult.status.toNumber();
  if (status === 4) return workResult.uri;
  if (status === 5) throw Error('Bridge computation failed');

  await sleep(FETCH_INTERVAL);
  return waitForWorkResult(fn, txHash, counter + 1);
};

module.exports = {
  getAppBinaryFieldName,
  getFieldValue,
  waitFor,
  waitForWorkResult,
};
