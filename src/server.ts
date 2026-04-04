import "dotenv/config";
import path from "path";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  // TODO: implémenter les routes API
});
