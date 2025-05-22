// index.js
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");
const fs = require("fs");

const { Client, GatewayDispatchEvents, Partials, GatewayIntentBits } = require("discord.js");
const { Riffy } = require("riffy");
const { Spotify } = require("riffy-spotify");

const config = require("./config.js");
const messages = require("./utils/messages.js");
const emojis = require("./emojis.js");

// Middleware setup
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Error logging
const errorLogPath = path.join(__dirname, "logs", "errors.log");
fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });

function logError(err) {
  const logEntry = `[${new Date().toISOString()}] ${err}\n`;
  fs.appendFileSync(errorLogPath, logEntry);
}

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Spotify plugin
const spotify = new Spotify({
  clientId: config.spotify.clientId,
  clientSecret: config.spotify.clientSecret
});

// Riffy setup
client.riffy = new Riffy(client, config.nodes, {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild?.shard) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytmsearch",
  restVersion: "v4",
  plugins: [spotify]
});

// Home page route
app.get("/", (req, res) => {
  const playersHTML = Array.from(client.riffy.players.values()).map((player) => {
    const guild = client.guilds.cache.get(player.guildId);
    const track = player.queue.current;
    return `
      <div class="bg-gray-800 p-4 rounded-lg shadow-md mb-4">
        <h3 class="text-xl font-semibold text-green-400">${guild?.name || "Unknown Server"}</h3>
        <p class="text-sm text-gray-300">🎶 Now Playing: <strong>${track?.info?.title || "None"}</strong></p>
        <p class="text-sm text-gray-300">🔊 Voice Channel: <strong>${guild?.channels.cache.get(player.voiceChannel)?.name || "Unknown"}</strong></p>
      </div>
    `;
  }).join("") || "<p class='text-gray-300'>No active players.</p>";

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="refresh" content="10">
      <title>Vitality Bot Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white font-sans">
      <div class="max-w-3xl mx-auto p-4">
        <h1 class="text-3xl text-green-400 font-bold mb-6 text-center">Vitality Bot Status</h1>
        <ul class="mb-6 text-gray-300">
          <li><strong>Bot:</strong> ${client.user?.tag || "Starting..."}</li>
          <li><strong>ID:</strong> ${client.user?.id || "Loading..."}</li>
          <li><strong>Status:</strong> ✅ Online</li>
          <li><strong>Servers:</strong> ${client.guilds.cache.size}</li>
          <li><strong>Uptime:</strong> ${Math.floor(process.uptime() / 60)} minutes</li>
        </ul>
        <h2 class="text-xl text-green-300 mb-2">Now Playing:</h2>
        ${playersHTML}
        <h2 class="text-xl text-green-300 mt-8 mb-2">Error Logs</h2>
        <pre class="bg-gray-800 p-4 rounded h-64 overflow-y-scroll text-sm">${fs.existsSync(errorLogPath) ? fs.readFileSync(errorLogPath, "utf-8") : "No errors logged."}</pre>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// Start server
app.listen(port, () => {
  console.log(`🌐 Web dashboard running at http://localhost:${port}`);
});

// Command definitions
const commands = [
  { name: 'play <query>', description: 'Play a song or playlist' },
  { name: 'pause', description: 'Pause the current track' },
  { name: 'resume', description: 'Resume the current track' },
  { name: 'skip', description: 'Skip the current track' },
  { name: 'stop', description: 'Stop playback and clear queue' },
  { name: 'queue', description: 'Show the current queue' },
  { name: 'nowplaying', description: 'Show current track info' },
  { name: 'volume <0-100>', description: 'Adjust player volume' },
  { name: 'shuffle', description: 'Shuffle the current queue' },
  { name: 'loop', description: 'Toggle queue loop mode' },
  { name: 'remove <position>', description: 'Remove a track from queue' },
  { name: 'clear', description: 'Clear the current queue' },
  { name: 'status', description: 'Show player status' },
  { name: 'help', description: 'Show this help message' }
];

// Ready event
client.on("ready", () => {
  client.riffy.init(client.user.id);
  console.log(`${emojis.success} Logged in as ${client.user.tag}`);
});

// Voice state updates
client.on("raw", (d) => {
  if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
  client.riffy.updateVoiceState(d);
});

// Message commands
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;

  const args = message.content.slice(config.prefix.length).trim().split(" ");
  const command = args.shift().toLowerCase();

  const musicCommands = ["play", "skip", "stop", "pause", "resume", "queue", "nowplaying", "volume", "shuffle", "loop", "remove", "clear"];
  if (musicCommands.includes(command)) {
    if (!message.member.voice.channel) {
      return messages.error(message.channel, "You must be in a voice channel!");
    }
  }

  switch (command) {
    case "help": messages.help(message.channel, commands); break;

    case "play": {
      const query = args.join(" ");
      if (!query) return messages.error(message.channel, "Please provide a search query!");
      try {
        const player = client.riffy.createConnection({
          guildId: message.guild.id,
          voiceChannel: message.member.voice.channel.id,
          textChannel: message.channel.id,
          deaf: true
        });

        const resolve = await client.riffy.resolve({ query, requester: message.author });
        const { loadType, tracks, playlistInfo } = resolve;

        if (loadType === "playlist") {
          for (const track of tracks) {
            track.info.requester = message.author;
            player.queue.add(track);
          }
          messages.addedPlaylist(message.channel, playlistInfo, tracks);
          if (!player.playing && !player.paused) player.play();
        } else if (loadType === "search" || loadType === "track") {
          const track = tracks.shift();
          track.info.requester = message.author;
          player.queue.add(track);
          messages.addedToQueue(message.channel, track, player.queue.length);
          if (!player.playing && !player.paused) player.play();
        } else {
          return messages.error(message.channel, "No results found! Try with a different search term.");
        }
      } catch (error) {
        console.error(error);
        messages.error(message.channel, "An error occurred while playing the track!");
      }
      break;
    }

    case "skip": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player) return messages.error(message.channel, "Nothing is playing!");
      if (!player.queue.length) return messages.error(message.channel, "No more tracks to skip!");
      player.stop();
      messages.success(message.channel, "Skipped the current track!");
      break;
    }

    case "stop": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player) return messages.error(message.channel, "Nothing is playing!");
      player.destroy();
      messages.success(message.channel, "Stopped the music and cleared the queue!");
      break;
    }

    case "pause": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player || player.paused) return messages.error(message.channel, "Nothing is playing or already paused!");
      player.pause(true);
      messages.success(message.channel, "Paused the music!");
      break;
    }

    case "resume": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player || !player.paused) return messages.error(message.channel, "Nothing is paused!");
      player.pause(false);
      messages.success(message.channel, "Resumed the music!");
      break;
    }

    case "queue": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player || (!player.queue.length && !player.queue.current)) return messages.error(message.channel, "Queue is empty!");
      messages.queueList(message.channel, player.queue, player.queue.current);
      break;
    }

    case "nowplaying": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player?.queue.current) return messages.error(message.channel, "Nothing is currently playing!");
      messages.nowPlaying(message.channel, player.queue.current);
      break;
    }

    case "volume": {
      const player = client.riffy.players.get(message.guild.id);
      const volume = parseInt(args[0]);
      if (!player || isNaN(volume) || volume < 0 || volume > 100) return messages.error(message.channel, "Invalid volume (0-100)!");
      player.setVolume(volume);
      messages.success(message.channel, `Set volume to ${volume}%`);
      break;
    }

    case "shuffle": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player?.queue.length) return messages.error(message.channel, "Not enough tracks to shuffle!");
      player.queue.shuffle();
      messages.success(message.channel, `${emojis.shuffle} Shuffled the queue!`);
      break;
    }

    case "loop": {
      const player = client.riffy.players.get(message.guild.id);
      const mode = player.loop === "none" ? "queue" : "none";
      player.setLoop(mode);
      messages.success(message.channel, `${mode === "queue" ? "Enabled" : "Disabled"} loop mode!`);
      break;
    }

    case "remove": {
      const player = client.riffy.players.get(message.guild.id);
      const pos = parseInt(args[0]);
      if (!player || isNaN(pos) || pos < 1 || pos > player.queue.length)
        return messages.error(message.channel, `Invalid track number (1 - ${player.queue.length})`);
      const removed = player.queue.remove(pos - 1);
      messages.success(message.channel, `Removed **${removed.info.title}** from the queue!`);
      break;
    }

    case "clear": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player?.queue.length) return messages.error(message.channel, "Queue is already empty!");
      player.queue.clear();
      messages.success(message.channel, "Cleared the queue!");
      break;
    }

    case "status": {
      const player = client.riffy.players.get(message.guild.id);
      if (!player) return messages.error(message.channel, "No active player found!");
      messages.playerStatus(message.channel, player);
      break;
    }
  }
});

// Riffy events
client.riffy.on("nodeConnect", (node) => {
  console.log(`${emojis.success} Node "${node.name}" connected.`);
});

client.riffy.on("nodeError", (node, error) => {
  console.log(`${emojis.error} Node "${node.name}" error: ${error.message}`);
});

client.riffy.on("trackStart", (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  messages.nowPlaying(channel, track);
});

client.riffy.on("queueEnd", (player) => {
  const channel = client.channels.cache.get(player.textChannel);
  player.destroy();
  messages.queueEnded(channel);
});

// Error handling
process.on("uncaughtException", err => logError(err.stack || err));
process.on("unhandledRejection", reason => logError(reason instanceof Error ? reason.stack : reason));

// Login
client.login(config.botToken);
