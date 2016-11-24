module.exports = {
  plugins: {
    appWebinject: {
      contextPath: '/webinject-bdd',
      interceptor: 'tamper'
    },
    appWebserver: {
      defaultRedirectUrl: '/webinject-bdd/index'
    }
  }
};
