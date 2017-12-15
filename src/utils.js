const getApplicationBinaryFieldName = (_os, _cpu) => {
  if ((_os === undefined) || (_cpu === undefined)) {
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

module.exports = {
  getApplicationBinaryFieldName,
};
