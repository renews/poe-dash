import { Router, Request } from "express";
import fs from "fs";
import path from "path";

import { WebSocket } from "ws";
import chokidar, { FSWatcher } from "chokidar";
import { getStableConfigPath } from "../config";

export const chatRouter = Router();
const configPath = getStableConfigPath();
const legacyConfigPath = path.resolve("config.json");
let config = loadConfig();
let chatFileContent = config.chatPath
  ? fs.readFileSync(config.chatPath, "utf-8")
  : "";
let messages = parseMessages(chatFileContent);
let wss: WebSocket;
let chatFileWatcher: FSWatcher | undefined;

if (config && chatFileContent) {
  setupChatFileWatcher();
}

function loadConfig() {
  const sourcePath = fs.existsSync(configPath)
    ? configPath
    : legacyConfigPath;

  if (!fs.existsSync(sourcePath)) {
    return {};
  }

  const loadedConfig = JSON.parse(fs.readFileSync(sourcePath).toString());
  if (sourcePath === legacyConfigPath && !fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(loadedConfig, null, 2));
  }

  return loadedConfig;
}

function updateConfig(newConfig: Record<string, any>) {
  const config = loadConfig();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...config, ...newConfig }, null, 2),
  );
}

// Route to save file path
chatRouter.post("/", (req, res) => {
  const { filePath } = req.body;

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(400).send("Invalid file path");
    return;
  }

  config = loadConfig();
  config.chatPath = filePath;

  updateConfig(config);

  chatFileContent = config.chatPath
    ? fs.readFileSync(config.chatPath, "utf-8")
    : "";
  messages = parseMessages(chatFileContent);
  setupChatFileWatcher();

  res.send("Chat path saved");
});

// Route to parse chat offers
chatRouter.get("/offers", (_req, res) => {
  if (!config.chatPath) {
    res.json([]);
    return;
  }

  if (!fs.existsSync(config.chatPath)) {
    res.status(400).send("Chat file path not defined or does not exist");
    return;
  }

  res.json(messages);
});

// Function to parse messages
export function parseMessages(content: string) {
  const offerRegex =
    /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \d+ [a-f0-9]+ \[INFO Client \d+\] @From (.+?): Hi, I would like to buy your (.+) listed for ([\d.]+ .+) in .*(?:stash tab "(.+?)"; position: left (\d+), top (\d+))/g;
  const messages = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const match = offerRegex.exec(line);
    if (match) {
      const [
        _,
        timestamp,
        characterName,
        itemName,
        price,
        stashTab,
        left,
        top,
      ] = match;
      messages.unshift({
        message: line,
        timestamp,
        characterName,
        item: {
          name: itemName,
          price,
          stashTab,
          position: {
            left: parseInt(left, 10),
            top: parseInt(top, 10),
          },
        },
      });
    }
  }

  return messages;
}

export function wsChat(ws: WebSocket, _req: Request) {
  console.log("forwarding chat messages to client");
  wss = ws;
}

function setupChatFileWatcher() {
  if (!config.chatPath) return;

  void chatFileWatcher?.close();
  chatFileWatcher = chokidar.watch(config.chatPath, {
    persistent: true,
    usePolling: true,
    interval: 100,
  });

  chatFileWatcher.on("change", (path) => {
    console.log(`File ${path} has been changed`);
    const newContent = fs.readFileSync(path, "utf-8");
    const changes = newContent.slice(chatFileContent.length);

    console.log({ changes });
    chatFileContent = newContent;

    const newMessages = parseMessages(changes);

    messages = newMessages.concat(messages);
    console.log({ newMessages });

    if (newMessages.length > 0 && wss) {
      console.log("emitting chat message");
      wss.emit("chat", JSON.stringify(newMessages));
      wss.send(JSON.stringify(newMessages));
    }
  });
}
