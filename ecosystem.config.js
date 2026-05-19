module.exports = {
  apps: [
    {
      name: "crttask",
      script: "server.cjs",
      env: {
        NODE_ENV: "production",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_SQ58q-jTLrAmsNYKI-NXXA_TZfatL-y",
      },
    },
  ],
};
