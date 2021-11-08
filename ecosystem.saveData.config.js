module.exports = {
  apps: [
    {
      name: 'binanceFutureSaveData',
      interpreter: 'bash',
      script: 'yarn.sh',
      args: 'saveData',
      watch: false,
    },
  ],
};
