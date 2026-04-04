import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("src/public"));

app.listen(PORT, () => {
  // TODO: implémenter les routes API
});
