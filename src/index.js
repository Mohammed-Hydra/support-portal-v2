const { createApp } = require("./app");

const PORT = Number(process.env.PORT || 5000);
let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

module.exports = async (req, res) => {
  const app = await getApp();
  return app(req, res);
};

if (require.main === module) {
  getApp()
    .then((app) => {
      app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`IT Support Portal v2 backend running on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to start backend:", error);
      process.exit(1);
    });
}
