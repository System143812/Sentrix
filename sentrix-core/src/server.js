import dotenv from "dotenv";
import createApp from "./app.js";
import http from "http";

dotenv.config({ path: "../.env" });

const app = createApp();
const server = http.createServer(app);
const port = process.env.PORT;

server.listen(port, () => {
  console.log(`Server started at port ${port}`);
});
