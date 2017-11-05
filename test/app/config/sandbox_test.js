module.exports = {
  application: {
    contextPath: '/webinject-bdd'
  },
  plugins: {
    appWebinject: {
      contextPath: '/webinject-bdd',
      interceptor: 'tamper'
    },
    appWebweaver: {
      defaultRedirectUrl: '/webinject-bdd/index'
    }
  }
};
