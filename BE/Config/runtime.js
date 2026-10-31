// Holds the validated env for services that need secrets. Set once by createApp().
let current = null;

function setEnv(env) {
  current = env;
}

function getEnv() {
  if (!current) throw new Error("Environment not initialised — call createApp(env) first");
  return current;
}

module.exports = { setEnv, getEnv };
