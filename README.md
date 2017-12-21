# iexec-server-js-client [![npm version](https://badge.fury.io/js/iexec-server-js-client.svg)](https://www.npmjs.com/package/iexec-server-js-client)
JS client lib to interact with iExec REST API

# Test
```bash
npm test
```


# Example
```js
const createIEXECClient = require('iexec-server-js-client')

const iexec = createIEXECClient({
  login: '',
  password: '',
  server: 'http://localhost:9443',
})

iexec.getApps().then(console.log) // print apps from server
```
