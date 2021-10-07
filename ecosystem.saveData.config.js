module.exports = {
  apps: [
    {
      name: 'binanceFutureSaveData',
      interpreter: 'bash',
      script: 'yarn',
      args: 'saveData',
      watch: false,
    },
  ],
};
