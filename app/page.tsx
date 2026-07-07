"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Bot,
  Camera,
  Check,
  Copy,
  Download,
  Edit3,
  FileArchive,
  FileCode2,
  Github,
  ImagePlus,
  Instagram,
  Loader2,
  MessageSquare,
  Mic,
  Moon,
  Paperclip,
  Folder,
  FolderPlus,
  Pin,
  PinOff,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Star,
  Sun,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Role = "user" | "assistant";

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "file";
  dataUrl?: string;
  content?: string;
};

type Message = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  error?: boolean;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  pinned: boolean;
  favorite: boolean;
  folder: string;
  createdAt: number;
  updatedAt: number;
};

type ProjectSummary = {
  name: string;
  description: string;
  lastModified: number;
  messageCount: number;
  fileCount: number;
  pinned: boolean;
};

type MessagePart =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language: string }
  | { type: "table"; rows: string[][] };

const TEXT_FILE_TYPES = new Set(["txt", "md", "json", "js", "ts", "jsx", "tsx", "py", "java", "cpp"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_IMAGE_SIDE = 1600;
const IMAGE_QUALITY = 0.88;
const STORAGE_KEY = "haryx-ai-coder-conversations";
const DB_NAME = "haryx-ai-coder-db";
const DB_VERSION = 1;
const STORE_NAME = "conversations";
const DEVELOPER_REPLY =
  "HARYX AI Coder was built by HARYX, Founder & Developer of HARYX AI Coder.\n\nGitHub: https://github.com/MHR-GEEK\nInstagram: https://www.instagram.com/md_haris_raza_/";

function uid() {
  return crypto.randomUUID();
}

function createConversation(title = "New HARYX Chat"): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title,
    messages: [],
    pinned: false,
    favorite: false,
    folder: "Recent",
    createdAt: now,
    updatedAt: now
  };
}

function createProjectSummary(name: string, conversations: Conversation[]): ProjectSummary {
  const projectConversations = conversations.filter((conversation) => conversation.folder === name);
  return {
    name,
    description: `${projectConversations.length} chat${projectConversations.length === 1 ? "" : "s"} in this workspace`,
    lastModified: Math.max(...projectConversations.map((conversation) => conversation.updatedAt), 0) || Date.now(),
    messageCount: projectConversations.reduce((total, conversation) => total + conversation.messages.length, 0),
    fileCount: projectConversations.reduce(
      (total, conversation) => total + conversation.messages.reduce((count, message) => count + (message.attachments?.length || 0), 0),
      0
    ),
    pinned: projectConversations.some((conversation) => conversation.pinned)
  };
}

function friendlyVoiceError(error?: string) {
  if (!window.isSecureContext) return "Voice input needs HTTPS. Vercel is secure; localhost is allowed for testing.";
  if (error === "not-allowed" || error === "permission-denied") return "Microphone permission was denied. Allow microphone access in your browser and try again.";
  if (error === "no-speech") return "I did not hear anything. Try speaking again.";
  if (error === "audio-capture") return "No microphone was found. Check your input device.";
  if (error === "network") return "Speech service could not connect. Your browser may be blocking online speech recognition; try Chrome or Edge on HTTPS.";
  return "Microphone could not start. Check browser permissions and try again.";
}

function normalizeConversation(conversation: Partial<Conversation>): Conversation {
  return {
    id: conversation.id || uid(),
    title: conversation.title || "Imported Chat",
    messages: conversation.messages || [],
    pinned: Boolean(conversation.pinned),
    favorite: Boolean(conversation.favorite),
    folder: conversation.folder || "Recent",
    createdAt: conversation.createdAt || Date.now(),
    updatedAt: conversation.updatedAt || Date.now()
  };
}

function openConversationDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readConversationsFromDb() {
  const db = await openConversationDb();
  return new Promise<Conversation[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as Partial<Conversation>[]).map(normalizeConversation));
    request.onerror = () => reject(request.error);
  });
}

async function writeConversationsToDb(conversations: Conversation[]) {
  const db = await openConversationDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    conversations.forEach((conversation) => store.put(conversation));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function isDeveloperQuestion(content: string) {
  return /\b(who\s+(made|built|developed)|developer|about\s+developer|built\s+by)\b/i.test(content);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilename(title: string, extension: string) {
  return `${title.replace(/[^\w-]+/g, "-").toLowerCase() || "haryx-chat"}.${extension}`;
}

function resizeImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const source = String(reader.result);
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
        if (scale === 1 && file.size < 900_000) {
          resolve(source);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(source);
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };

      image.onerror = () => reject(new Error("Image preview failed"));
      image.src = source;
    };

    reader.onerror = () => reject(new Error("Image upload failed"));
    reader.readAsDataURL(file);
  });
}

function splitMessage(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const codeBlockPattern = /```([\w.+-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...splitTextAndTables(content.slice(lastIndex, match.index)));
    }
    parts.push({ type: "code", language: match[1] || "code", content: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) parts.push(...splitTextAndTables(content.slice(lastIndex)));
  return parts.length ? parts : [{ type: "text", content }];
}

function splitTextAndTables(text: string): MessagePart[] {
  const lines = text.split("\n");
  const parts: MessagePart[] = [];
  let buffer: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const isTableStart = lines[index]?.includes("|") && lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/);
    if (!isTableStart) {
      buffer.push(lines[index]);
      index += 1;
      continue;
    }

    if (buffer.join("\n").trim()) parts.push({ type: "text", content: buffer.join("\n") });
    buffer = [];

    const tableLines = [lines[index]];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      tableLines.push(lines[index]);
      index += 1;
    }

    parts.push({
      type: "table",
      rows: tableLines.map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()))
    });
  }

  if (buffer.join("\n").trim()) parts.push({ type: "text", content: buffer.join("\n") });
  return parts;
}

function renderInlineMarkdown(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    return <span key={index}>{token}</span>;
  });
}

function MarkdownText({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("### ")) return <h3 key={index}>{renderInlineMarkdown(trimmed.slice(4))}</h3>;
        if (trimmed.startsWith("## ")) return <h2 key={index}>{renderInlineMarkdown(trimmed.slice(3))}</h2>;
        if (trimmed.startsWith("# ")) return <h1 key={index}>{renderInlineMarkdown(trimmed.slice(2))}</h1>;

        const lines = trimmed.split("\n");
        const isList = lines.every((line) => /^[-*]\s+/.test(line.trim()));
        const isOrdered = lines.every((line) => /^\d+\.\s+/.test(line.trim()));

        if (isList) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => <li key={lineIndex}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }

        if (isOrdered) {
          return (
            <ol key={index}>
              {lines.map((line, lineIndex) => <li key={lineIndex}>{renderInlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>)}
            </ol>
          );
        }

        return <p key={index}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </>
  );
}

const CodeBlock = memo(function CodeBlock({
  content,
  language,
  onCopy,
  copied
}: {
  content: string;
  language: string;
  onCopy: (code: string) => void;
  copied: boolean;
}) {
  const [collapsed, setCollapsed] = useState(content.split("\n").length > 22);
  const extension = language && language !== "code" ? language.replace(/[^\w-]/g, "") : "txt";

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <small>{language}</small>
        <div>
          {content.split("\n").length > 22 && (
            <button type="button" onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Expand" : "Collapse"}</button>
          )}
          <button type="button" onClick={() => downloadText(`haryx-code.${extension}`, content, "text/plain")} aria-label="Download code">
            <Download size={15} />
            Download
          </button>
          <button type="button" onClick={() => onCopy(content)} aria-label="Copy code">
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className={collapsed ? "collapsed-code" : ""}>
        <code>{content}</code>
      </pre>
    </div>
  );
});

function AttachmentPreview({ attachment, onRemove }: { attachment: Attachment; onRemove?: (id: string) => void }) {
  return (
    <div className="attachment-chip">
      {attachment.kind === "image" && attachment.dataUrl ? (
        <button className="thumb-button" type="button" onClick={() => window.open(attachment.dataUrl, "_blank")} aria-label={`Open ${attachment.name}`}>
          <img src={attachment.dataUrl} alt={attachment.name} />
        </button>
      ) : (
        <span className="file-icon">{fileExtension(attachment.name) === "zip" ? <FileArchive size={18} /> : <FileCode2 size={18} />}</span>
      )}
      <span>
        <strong>{attachment.name}</strong>
        <small>{Math.max(1, Math.round(attachment.size / 1024))} KB</small>
      </span>
      {onRemove && (
        <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number; rotation: number; spin: number; hue: number }>>([]);
  const pointerRef = useRef({ x: -1000, y: -1000, lastX: -1000, lastY: -1000, moving: false });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const context = canvasElement?.getContext("2d", { alpha: true });
    if (!canvasElement || !context) return;
    const canvas = canvasElement;
    const drawingContext = context;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      drawingContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function addParticles(x: number, y: number, amount: number) {
      const particles = particlesRef.current;
      for (let index = 0; index < amount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.25 + Math.random() * 1.2;
        particles.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.2,
          life: 1,
          size: 1.2 + Math.random() * 3.2,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.08,
          hue: Math.random() > 0.78 ? 270 : 42
        });
      }
      if (particles.length > 120) particles.splice(0, particles.length - 120);
    }

    function onPointerMove(event: PointerEvent) {
      const pointer = pointerRef.current;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moving = true;
      const distance = Math.hypot(pointer.x - pointer.lastX, pointer.y - pointer.lastY);
      addParticles(pointer.x, pointer.y, Math.min(5, Math.max(1, Math.floor(distance / 18))));
    }

    function render() {
      drawingContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const pointer = pointerRef.current;
      const glow = drawingContext.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 180);
      glow.addColorStop(0, "rgba(217, 179, 108, 0.14)");
      glow.addColorStop(0.42, "rgba(201, 154, 67, 0.06)");
      glow.addColorStop(1, "rgba(217, 179, 108, 0)");
      drawingContext.fillStyle = glow;
      drawingContext.fillRect(0, 0, window.innerWidth, window.innerHeight);

      particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0.015);
      for (const particle of particlesRef.current) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.life *= 0.955;
        particle.rotation += particle.spin;

        drawingContext.save();
        drawingContext.translate(particle.x, particle.y);
        drawingContext.rotate(particle.rotation);
        const alpha = particle.life;
        const fill = particle.hue === 270 ? `rgba(139, 92, 246, ${alpha})` : `rgba(240, 210, 154, ${alpha})`;
        drawingContext.shadowBlur = 18;
        drawingContext.shadowColor = particle.hue === 270 ? "rgba(139, 92, 246, 0.8)" : "rgba(217, 179, 108, 0.9)";
        drawingContext.fillStyle = fill;
        drawingContext.beginPath();
        drawingContext.moveTo(0, -particle.size);
        drawingContext.lineTo(particle.size * 0.45, 0);
        drawingContext.lineTo(0, particle.size);
        drawingContext.lineTo(-particle.size * 0.45, 0);
        drawingContext.closePath();
        drawingContext.fill();
        drawingContext.restore();
      }

      frameRef.current = requestAnimationFrame(render);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return <canvas className="cursor-canvas" ref={canvasRef} aria-hidden="true" />;
}

const ChatMessage = memo(function ChatMessage({
  message,
  copiedCode,
  copiedMessage,
  onCopyCode,
  onCopyMessage,
  onRegenerate,
  onDelete,
  onEdit
}: {
  message: Message;
  copiedCode: string | null;
  copiedMessage: string | null;
  onCopyCode: (code: string) => void;
  onCopyMessage: (message: Message) => void;
  onRegenerate: (message: Message) => void;
  onDelete: (id: string) => void;
  onEdit: (message: Message) => void;
}) {
  const parts = useMemo(() => splitMessage(message.content), [message.content]);

  return (
    <article className={`message ${message.role} ${message.error ? "error" : ""}`}>
      <div className="avatar" aria-hidden="true">{message.role === "assistant" ? <Bot size={18} /> : "You"}</div>
      <div className="message-body">
        <div className="message-meta">
          <strong>{message.role === "assistant" ? "HARYX AI" : "You"}</strong>
          <time>{formatTime(message.timestamp)}</time>
        </div>
        {message.attachments?.length ? (
          <div className="sent-attachments">
            {message.attachments.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
          </div>
        ) : null}
        <div className="message-content">
          {parts.map((part, index) => {
            if (part.type === "code") {
              return (
                <CodeBlock
                  key={`${message.id}-code-${index}`}
                  content={part.content}
                  language={part.language}
                  copied={copiedCode === part.content}
                  onCopy={onCopyCode}
                />
              );
            }

            if (part.type === "table") {
              return (
                <div className="table-wrap" key={`${message.id}-table-${index}`}>
                  <table>
                    <tbody>
                      {part.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            return <MarkdownText key={`${message.id}-text-${index}`} content={part.content} />;
          })}
        </div>
        <div className="message-actions">
          <button type="button" onClick={() => onCopyMessage(message)}>
            {copiedMessage === message.id ? <Check size={14} /> : <Copy size={14} />}
            {copiedMessage === message.id ? "Copied" : "Copy"}
          </button>
          {message.role === "assistant" && <button type="button" onClick={() => onRegenerate(message)}><RefreshCcw size={14} /> Regenerate</button>}
          {message.role === "user" && <button type="button" onClick={() => onEdit(message)}><Edit3 size={14} /> Edit</button>}
          <button type="button" onClick={() => onDelete(message.id)}><Trash2 size={14} /> Delete</button>
        </div>
      </div>
    </article>
  );
});

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"idle" | "connected" | "needs-setup">("idle");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [activeProject, setActiveProject] = useState("Recent");
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const topUploadRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0];
  }, [activeConversationId, conversations]);

  const title = activeConversation?.title || "New HARYX Chat";
  const messages = activeConversation?.messages || [];
  const currentProject = activeConversation?.folder || activeProject;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    readConversationsFromDb()
      .then((stored) => {
        if (stored.length) {
          const normalized = stored.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
          setConversations(normalized);
          setActiveConversationId(normalized[0].id);
          return;
        }

        const saved = localStorage.getItem("ai-coder-chat");
        const savedConversations = localStorage.getItem(STORAGE_KEY);
        if (savedConversations) {
          const parsed = JSON.parse(savedConversations) as Partial<Conversation>[];
          const normalized = parsed.length ? parsed.map(normalizeConversation) : [createConversation()];
          setConversations(normalized);
          setActiveConversationId(normalized[0].id);
          writeConversationsToDb(normalized);
          return;
        }

        if (saved) {
          const parsed = JSON.parse(saved);
          const migrated = createConversation(parsed.title || "AI Coder Chat");
          migrated.messages = parsed.messages || [];
          setConversations([migrated]);
          setActiveConversationId(migrated.id);
          localStorage.removeItem("ai-coder-chat");
          writeConversationsToDb([migrated]);
          return;
        }

        const initial = createConversation();
        setConversations([initial]);
        setActiveConversationId(initial.id);
        writeConversationsToDb([initial]);
      })
      .catch(() => {
        const initial = createConversation();
        setConversations([initial]);
        setActiveConversationId(initial.id);
      });
  }, []);

  useEffect(() => {
    if (conversations.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      writeConversationsToDb(conversations).catch(() => setBackendStatus("needs-setup"));
    }
  }, [conversations]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleVoiceInput();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const visibleMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const needle = search.toLowerCase();
    return messages.filter((message) => message.content.toLowerCase().includes(needle));
  }, [messages, search]);

  const statusText = useMemo(() => {
    if (loading) return "Generating";
    if (backendStatus === "connected") return "AI online";
    if (backendStatus === "needs-setup") return "Needs attention";
    return "Ready";
  }, [backendStatus, loading]);

  const sortedConversations = useMemo(() => {
    const needle = conversationSearch.toLowerCase();
    return [...conversations]
      .filter((conversation) => {
        const inProject = conversation.folder === currentProject;
        if (!inProject) return false;
        if (!needle) return true;
        return (
          conversation.title.toLowerCase().includes(needle) ||
          conversation.messages.some((message) => message.content.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [conversationSearch, conversations, currentProject]);

  const projects = useMemo(() => {
    const needle = projectSearch.toLowerCase();
    const names = Array.from(new Set(conversations.map((conversation) => conversation.folder || "Recent")));
    return names
      .map((name) => createProjectSummary(name, conversations))
      .filter((project) => !needle || project.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastModified - a.lastModified);
  }, [conversations, projectSearch]);

  const updateActiveConversation = useCallback((updater: (conversation: Conversation) => Conversation) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...updater(conversation), updatedAt: Date.now() }
          : conversation
      )
    );
  }, [activeConversationId]);

  const setMessages = useCallback((next: Message[] | ((messages: Message[]) => Message[])) => {
    updateActiveConversation((conversation) => ({
      ...conversation,
      messages: typeof next === "function" ? next(conversation.messages) : next
    }));
  }, [updateActiveConversation]);

  function renameConversation(id: string, nextTitle: string) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, title: nextTitle || "Untitled Chat", updatedAt: Date.now() } : conversation
      )
    );
  }

  function createNewChat() {
    const next = createConversation();
    next.folder = currentProject;
    setConversations((current) => [next, ...current]);
    setActiveConversationId(next.id);
    setInput("");
    setAttachments([]);
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== id);
      if (!next.length) {
        const fresh = createConversation();
        setActiveConversationId(fresh.id);
        return [fresh];
      }
      if (id === activeConversationId) setActiveConversationId(next[0].id);
      return next;
    });
  }

  function togglePinConversation(id: string) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, pinned: !conversation.pinned, updatedAt: Date.now() } : conversation
      )
    );
  }

  function toggleFavoriteConversation(id: string) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, favorite: !conversation.favorite, updatedAt: Date.now() } : conversation
      )
    );
  }

  function createProject() {
    const name = window.prompt("Project name", "New Project")?.trim();
    if (!name) return;
    const next = createConversation("New chat");
    next.folder = name;
    setConversations((current) => [next, ...current]);
    setActiveProject(name);
    setActiveConversationId(next.id);
  }

  function switchProject(name: string) {
    setActiveProject(name);
    const target = conversations
      .filter((conversation) => conversation.folder === name)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)[0];
    if (target) setActiveConversationId(target.id);
  }

  function renameProject(name: string) {
    const nextName = window.prompt("Rename project", name)?.trim();
    if (!nextName || nextName === name) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.folder === name ? { ...conversation, folder: nextName, updatedAt: Date.now() } : conversation
      )
    );
    if (activeProject === name) setActiveProject(nextName);
  }

  function deleteProject(name: string) {
    if (projects.length <= 1) return;
    const nextConversations = conversations.filter((conversation) => conversation.folder !== name);
    const nextProject = nextConversations[0]?.folder || "Recent";
    setConversations(nextConversations.length ? nextConversations : [createConversation()]);
    setActiveProject(nextProject);
    setActiveConversationId(nextConversations[0]?.id || "");
  }

  function togglePinProject(name: string) {
    const shouldPin = !conversations.some((conversation) => conversation.folder === name && conversation.pinned);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.folder === name ? { ...conversation, pinned: shouldPin, updatedAt: Date.now() } : conversation
      )
    );
  }

  function moveConversationToFolder(id: string) {
    const folder = window.prompt("Folder name", conversations.find((conversation) => conversation.id === id)?.folder || "Recent");
    if (!folder) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, folder, updatedAt: Date.now() } : conversation
      )
    );
  }

  function clearAllChats() {
    const fresh = createConversation();
    setConversations([fresh]);
    setActiveConversationId(fresh.id);
  }

  const readFiles = useCallback(async (files: FileList | File[]) => {
    const nextAttachments = await Promise.all(
      Array.from(files).map(async (file) => {
        const extension = fileExtension(file.name);
        const isImage = IMAGE_TYPES.has(file.type);
        const attachment: Attachment = {
          id: uid(),
          name: file.name,
          type: file.type || extension,
          size: file.size,
          kind: isImage ? "image" : "file"
        };

        if (isImage) {
          attachment.dataUrl = await resizeImage(file);
        } else if (TEXT_FILE_TYPES.has(extension)) {
          attachment.content = await file.text();
        }

        return attachment;
      })
    );

    setAttachments((current) => [...current, ...nextAttachments]);
  }, []);

  async function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Voice input is not supported in this browser. Use Chrome or Edge for SpeechRecognition.");
      return;
    }

    if (!window.isSecureContext) {
      setVoiceError(friendlyVoiceError());
      return;
    }

    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach((track) => track.stop());
    } catch (error) {
      const name = error instanceof DOMException ? error.name.toLowerCase() : "";
      setVoiceError(friendlyVoiceError(name.includes("denied") ? "permission-denied" : name));
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      setVoiceError("");
      setLiveTranscript("");
      setListening(true);
    };

    recognition.onerror = (event) => {
      const error = "error" in event ? String(event.error) : "microphone error";
      setVoiceError(friendlyVoiceError(error));
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setLiveTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";

      for (let index = event.results.length - 1; index >= 0; index -= 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) {
          finalText = `${transcript} ${finalText}`;
        } else {
          interim = `${transcript} ${interim}`;
        }
      }

      if (finalText.trim()) {
        setInput((current) => `${current}${current.trim() ? " " : ""}${finalText.trim()}`);
      }
      setLiveTranscript(interim.trim());
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setVoiceError("Voice input is already starting. Wait a moment and try again.");
      setListening(false);
    }
  }

  const submitMessage = useCallback(async (event?: FormEvent, quickAction?: string, retryMessages?: Message[]) => {
    event?.preventDefault();
    const retryUserMessage = retryMessages ? [...retryMessages].reverse().find((message) => message.role === "user") : undefined;
    const content = (quickAction || input || retryUserMessage?.content || "").trim();
    const hasAttachments = retryMessages ? Boolean(retryUserMessage?.attachments?.length) : attachments.length > 0;
    if ((!content && !hasAttachments) || loading) return;

    const userMessage: Message = {
      id: uid(),
      role: "user",
      content: content || "Analyze the attached file or image.",
      timestamp: Date.now(),
      attachments: retryMessages ? retryUserMessage?.attachments || [] : attachments
    };
    const nextMessages = retryMessages || [...messages, userMessage];
    const requestAttachments = retryMessages ? retryUserMessage?.attachments || [] : attachments;

    setMessages(nextMessages);
    if (!messages.length && content) renameConversation(activeConversationId, content.slice(0, 56));
    setInput("");
    setAttachments([]);

    if (isDeveloperQuestion(content)) {
      setMessages([
        ...nextMessages,
        { id: uid(), role: "assistant", content: DEVELOPER_REPLY, timestamp: Date.now() }
      ]);
      return;
    }

    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: abortRef.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
          images: requestAttachments.filter((item) => item.kind === "image" && item.dataUrl).map((item) => item.dataUrl),
          files: requestAttachments.filter((item) => item.kind === "file").map((item) => ({
            name: item.name,
            type: item.type,
            size: item.size,
            content: item.content
          }))
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "The AI service returned an error." }));
        throw new Error(data?.error || "The AI service returned an error.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("The AI provider returned an empty stream.");
      const assistantId = uid();
      setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "", timestamp: Date.now() }]);

      const decoder = new TextDecoder();
      let streamed = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamed += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: streamed } : message
          )
        );
      }

      if (!streamed.trim()) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: "I could not read a response from the AI provider.", error: true } : message
          )
        );
      }
      setBackendStatus("connected");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBackendStatus("needs-setup");
      setMessages([
        ...nextMessages,
        {
          id: uid(),
          role: "assistant",
          error: true,
          timestamp: Date.now(),
          content:
            error instanceof Error
              ? `# Connection Issue\n\n${error.message}\n\n## Try Again\n\n- Check your Vercel environment variables.\n- Verify the Ollama API key is valid.\n- Retry the request.`
              : "# Connection Issue\n\nThe AI backend could not be reached."
        }
      ]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [activeConversationId, attachments, input, loading, messages, setMessages]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) readFiles(event.dataTransfer.files);
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (files.length) await readFiles(files);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(null), 1300);
  }

  function copyMessage(message: Message) {
    navigator.clipboard.writeText(message.content);
    setCopiedMessage(message.id);
    window.setTimeout(() => setCopiedMessage(null), 1300);
  }

  function deleteMessage(id: string) {
    setMessages((current) => current.filter((message) => message.id !== id));
  }

  function editMessage(message: Message) {
    setInput(message.content);
    setMessages((current) => current.filter((item) => item.id !== message.id));
    textareaRef.current?.focus();
  }

  function regenerate(message: Message) {
    const index = messages.findIndex((item) => item.id === message.id);
    submitMessage(undefined, undefined, messages.slice(0, index).filter((item) => item.id !== message.id));
  }

  function exportMarkdown() {
    const markdown = messages.map((message) => `## ${message.role === "user" ? "User" : "HARYX AI"} - ${formatTime(message.timestamp)}\n\n${message.content}`).join("\n\n");
    downloadText(safeFilename(title, "md"), markdown, "text/markdown");
  }

  function exportText() {
    const text = messages.map((message) => `${message.role === "user" ? "User" : "HARYX AI"} (${formatTime(message.timestamp)})\n${message.content}`).join("\n\n---\n\n");
    downloadText(safeFilename(title, "txt"), text, "text/plain");
  }

  function copyChat() {
    const text = messages.map((message) => `${message.role === "user" ? "User" : "HARYX AI"}: ${message.content}`).join("\n\n");
    navigator.clipboard.writeText(text || title);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--mx", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY}px`);
  }

  return (
    <main
      className={`chat-app ${isDragging ? "dragging" : ""}`}
      onPointerMove={handlePointerMove}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="premium-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <CursorTrail />
      <header className="app-header">
        <a className="brand" href="#" aria-label="AI Coder home">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>
            <input value={title} onChange={(event) => renameConversation(activeConversationId, event.target.value)} aria-label="Rename chat" />
            <small>{statusText} - Built by HARYX</small>
          </span>
        </a>
        <div className="header-tools">
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chat" />
          </label>
          <span className={`status-badge ${backendStatus === "connected" ? "online" : backendStatus === "needs-setup" ? "attention" : ""}`}><i />Ollama {backendStatus === "connected" ? "Online" : "Ready"}</span>
          <button type="button" onClick={exportMarkdown} aria-label="Download chat"><Download size={18} /></button>
          <button type="button" onClick={exportText} aria-label="Export TXT">TXT</button>
          <button type="button" onClick={copyChat} aria-label="Copy chat"><Copy size={18} /></button>
          <button type="button" onClick={clearAllChats} aria-label="Delete chat"><Trash2 size={18} /></button>
          <button type="button" onClick={() => topUploadRef.current?.click()} aria-label="Upload file"><Upload size={18} /></button>
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a href="https://github.com/MHR-GEEK" target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={18} /></a>
          <a href="https://www.instagram.com/md_haris_raza_/" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={18} /></a>
          <span className="profile-avatar" aria-label="HARYX profile">H</span>
        </div>
        <input ref={topUploadRef} className="hidden-input" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.zip" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && readFiles(event.target.files)} />
      </header>

      <section className="chat-shell">
        <aside className="conversation-sidebar" aria-label="Conversation history">
          <div className="sidebar-top">
            <button type="button" onClick={createNewChat}><Plus size={16} /> New chat</button>
            <label className="sidebar-search">
              <Search size={15} />
              <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search chats" />
            </label>
          </div>

          <section className="project-section" aria-label="Projects">
            <div className="section-title">
              <span><Folder size={15} /> Projects</span>
              <button type="button" onClick={createProject} aria-label="Create project"><FolderPlus size={15} /></button>
            </div>
            <label className="sidebar-search compact">
              <Search size={14} />
              <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" />
            </label>
            <div className="project-list">
              {projects.map((project) => (
                <motion.article layout key={project.name} className={`project-item ${project.name === currentProject ? "active" : ""}`} whileHover={{ y: -1 }}>
                  <button type="button" onClick={() => switchProject(project.name)}>
                    <strong>{project.name}</strong>
                    <small>{project.description}</small>
                    <small>{project.messageCount} messages - {project.fileCount} files</small>
                  </button>
                  <div>
                    <button type="button" onClick={() => togglePinProject(project.name)} aria-label="Pin project">{project.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
                    <button type="button" onClick={() => renameProject(project.name)} aria-label="Rename project"><Edit3 size={13} /></button>
                    <button type="button" onClick={() => deleteProject(project.name)} aria-label="Delete project"><Trash2 size={13} /></button>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          <div className="conversation-list">
            <AnimatePresence initial={false}>
              {sortedConversations.map((conversation) => (
                <motion.article
                  layout
                  key={conversation.id}
                  className={`conversation-item ${conversation.id === activeConversationId ? "active" : ""}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <button type="button" className="conversation-main" onClick={() => setActiveConversationId(conversation.id)}>
                    <MessageSquare size={15} />
                    <span>
                      <strong>{conversation.title}</strong>
                      <small>{conversation.messages.length} messages</small>
                    </span>
                  </button>
                  <div className="conversation-actions">
                    <button type="button" onClick={() => toggleFavoriteConversation(conversation.id)} aria-label={conversation.favorite ? "Unfavorite chat" : "Favorite chat"}>
                      <Star size={14} />
                    </button>
                    <button type="button" onClick={() => moveConversationToFolder(conversation.id)} aria-label="Move chat to project">
                      <Folder size={14} />
                    </button>
                    <button type="button" onClick={() => togglePinConversation(conversation.id)} aria-label={conversation.pinned ? "Unpin chat" : "Pin chat"}>
                      {conversation.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button type="button" onClick={() => deleteConversation(conversation.id)} aria-label="Delete chat"><Trash2 size={14} /></button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>

          <motion.div className="developer-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <span className="dev-badge">Developer</span>
            <strong>HARYX</strong>
            <span>Founder & Developer of HARYX AI Coder</span>
            <div>
              <a href="https://github.com/MHR-GEEK" target="_blank" rel="noreferrer"><Github size={15} />GitHub</a>
              <a href="https://www.instagram.com/md_haris_raza_/" target="_blank" rel="noreferrer"><Instagram size={15} />Instagram</a>
            </div>
          </motion.div>
        </aside>

        <div className="messages" ref={chatRef}>
          {!messages.length && (
            <motion.div className="welcome-panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <div className="welcome-orb"><Sparkles size={28} /></div>
              <h1>HARYX AI</h1>
              <p>Premium coding workspace ready for builds, debugging, screenshots, files, refactors, and deployment work.</p>
            </motion.div>
          )}

          {visibleMessages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              copiedCode={copiedCode}
              copiedMessage={copiedMessage}
              onCopyCode={copyCode}
              onCopyMessage={copyMessage}
              onRegenerate={regenerate}
              onDelete={deleteMessage}
              onEdit={editMessage}
            />
          ))}

          {loading && (
            <article className="message assistant">
              <div className="avatar"><Bot size={18} /></div>
              <div className="message-body">
                <div className="message-meta"><strong>HARYX AI</strong><time>typing</time></div>
                <div className="typing-indicator"><span /><span /><span /> Thinking through the solution...</div>
              </div>
            </article>
          )}
        </div>

        <form className="composer" onSubmit={submitMessage}>
          {attachments.length > 0 && (
            <div className="attachment-strip">
              {attachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
                />
              ))}
            </div>
          )}

          <div className="composer-box">
            <label className="tool-button" aria-label="Upload image">
              <ImagePlus size={19} />
              <input type="file" accept=".png,.jpg,.jpeg,.webp" multiple capture="environment" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && readFiles(event.target.files)} />
            </label>
            <label className="tool-button" aria-label="Attach file">
              <Paperclip size={19} />
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.zip" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && readFiles(event.target.files)} />
            </label>
            <button className={`tool-button ${listening ? "recording" : ""}`} type="button" onClick={toggleVoiceInput} aria-label={listening ? "Stop voice input" : "Start voice input"}>
              {listening ? <Loader2 size={19} className="spin" /> : <Mic size={19} />}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Message HARYX AI. Drop images, paste screenshots, or attach files..."
              rows={1}
            />
            {loading ? (
              <button className="send-button" type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop generation"><Square size={18} /></button>
            ) : (
              <button className="send-button" type="submit" disabled={!input.trim() && attachments.length === 0} aria-label="Send message">
                <Send size={19} />
              </button>
            )}
          </div>
          {(liveTranscript || voiceError) && (
            <div className={`voice-status ${voiceError ? "error" : ""}`}>
              {voiceError || liveTranscript}
            </div>
          )}
          <div className="composer-hint"><Camera size={14} /> Enter sends - Shift+Enter adds a new line - Ctrl+M voice - Paste or drop screenshots anywhere</div>
        </form>
      </section>
    </main>
  );
}
