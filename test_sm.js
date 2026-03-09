const path = require('path');
const SecurityManager = require(path.resolve(__dirname, 'src/managers/SecurityManager'));
process.env.COMMAND_WHITELIST = "ls,pwd";
const sm = new SecurityManager();
console.log(sm.assess('ls'));
console.log(sm.assess('pwd'));
console.log(sm.assess('rm'));
