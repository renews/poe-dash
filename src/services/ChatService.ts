import axios from "axios";
import { ChatOffer } from "./types";

export const CHAT_FILE_PATH_STORAGE_KEY = "chatFilePath";
type ChatFilePathStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): ChatFilePathStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export function getSavedChatFilePath(
  storage: ChatFilePathStorage | undefined = getBrowserStorage(),
) {
  const value = storage?.getItem(CHAT_FILE_PATH_STORAGE_KEY)?.trim();
  return value || undefined;
}

export function saveChatFilePath(
  filePath: string,
  storage: ChatFilePathStorage | undefined = getBrowserStorage(),
) {
  const normalizedPath = filePath.trim();
  if (normalizedPath && storage) {
    storage.setItem(CHAT_FILE_PATH_STORAGE_KEY, normalizedPath);
  }
}

export function clearSavedChatFilePath(
  storage: ChatFilePathStorage | undefined = getBrowserStorage(),
) {
  storage?.removeItem(CHAT_FILE_PATH_STORAGE_KEY);
}

export class ChatService {
  private baseUrl = "http://localhost:7555"; // Assuming the same port as other services

  getSavedChatFilePath() {
    return getSavedChatFilePath();
  }

  clearSavedChatFilePath() {
    clearSavedChatFilePath();
  }

  async setChatFilePath(filePath: string): Promise<void> {
    try {
      const response = await axios.post(`${this.baseUrl}/chat`, { filePath });
      if (response.status !== 200) {
        throw new Error("Failed to set chat file path");
      }
      saveChatFilePath(filePath);
    } catch (error) {
      console.error("Error setting chat file path:", error);
      throw error;
    }
  }

  async getOffers(): Promise<ChatOffer[]> {
    try {
      const response = await axios.get<ChatOffer[]>(
        `${this.baseUrl}/chat/offers`,
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching chat offers:", error);
      throw error;
    }
  }
}

export const chatService = new ChatService();
