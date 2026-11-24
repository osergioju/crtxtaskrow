module.exports = {
  apps: [
    {
      name: "taskrow",
      script: "server.cjs",
      env: {
        NODE_ENV: "production",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_SQ58q-jTLrAmsNYKI-NXXA_TZfatL-y",
        EXPORTACAO_TOKEN: "f24a1759f03db35e5b822a72e20424cab85afe20dfc6d3ff",
      },
    },
  ],
};
