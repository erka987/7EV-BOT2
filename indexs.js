const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const prefix = '?';

// Simpan data musik per guild
const musicQueues = new Map();
// Simpan koneksi voice per guild (untuk stay mode)
const voiceConnections = new Map();

client.once('ready', () => {
  console.log(`Bot siap sebagai ${client.user.tag}`);
});

// ─── Fungsi helper musik ─────────────────────────────────────────────────────

async function playNext(guildId, textChannel) {
  const queue = musicQueues.get(guildId);
  if (!queue || queue.songs.length === 0) {
    musicQueues.delete(guildId);
    textChannel.send('✅ Queue musik kosong, bot selesai memutar musik.');
    return;
  }

  const song = queue.songs[0];

  try {
    const stream = ytdl(song.url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
    });

    const resource = createAudioResource(stream);
    queue.player.play(resource);

    const embed = new EmbedBuilder()
      .setTitle('🎵 Sekarang Memutar')
      .setDescription(`**[${song.title}](${song.url})**`)
      .setColor(0xff0000)
      .addFields(
        { name: 'Diminta oleh', value: song.requestedBy, inline: true },
      )
      .setTimestamp();
    textChannel.send({ embeds: [embed] });

  } catch (err) {
    console.error('[Music] Error playing song:', err.message);
    textChannel.send(`❌ Gagal memutar **${song.title}**. Melewati ke lagu berikutnya...`);
    queue.songs.shift();
    playNext(guildId, textChannel);
  }
}

// ─── Event handler ───────────────────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── !ping ──────────────────────────────────────────────────────────────────
  if (command === 'ping') {
    const latency = Date.now() - message.createdTimestamp;
    message.reply(`🏓 Pong! Latency: **${latency}ms**`);
  }

  // ── !help ──────────────────────────────────────────────────────────────────
  else if (command === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Daftar Command')
      .setColor(0x5865f2)
      .addFields(
        { name: '🔧 Umum', value: '`!ping` `!help` `!userinfo` `!serverinfo`' },
        { name: '🛡️ Moderasi', value: '`!kick` `!ban` `!clear`' },
        { name: '🔊 Voice', value: '`!join` `!leave` `!voicestatus`' },
        { name: '🎵 Musik', value: '`!play <url>` `!skip` `!stop` `!queue` `!nowplaying`' },
      )
      .setFooter({ text: `Diminta oleh ${message.author.tag}` })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }

  // ── !userinfo ──────────────────────────────────────────────────────────────
  else if (command === 'userinfo') {
    const target = message.mentions.users.first() || message.author;
    const member = message.guild.members.cache.get(target.id);
    const embed = new EmbedBuilder()
      .setTitle(`👤 Info Pengguna: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setColor(0x5865f2)
      .addFields(
        { name: 'ID', value: target.id, inline: true },
        { name: 'Username', value: target.username, inline: true },
        { name: 'Akun Dibuat', value: target.createdAt.toDateString(), inline: true },
        { name: 'Bergabung Server', value: member ? member.joinedAt.toDateString() : 'N/A', inline: true },
      )
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }

  // ── !serverinfo ────────────────────────────────────────────────────────────
  else if (command === 'serverinfo') {
    const guild = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`🏠 Info Server: ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setColor(0x5865f2)
      .addFields(
        { name: 'ID Server', value: guild.id, inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Total Member', value: `${guild.memberCount}`, inline: true },
        { name: 'Dibuat', value: guild.createdAt.toDateString(), inline: true },
      )
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }

  // ── !kick ──────────────────────────────────────────────────────────────────
  else if (command === 'kick') {
    if (!message.member.permissions.has('KickMembers')) {
      return message.reply('❌ Kamu tidak punya izin untuk kick member.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag pengguna yang ingin di-kick.');
    const reason = args.slice(1).join(' ') || 'Tidak ada alasan';
    await target.kick(reason);
    message.reply(`✅ **${target.user.tag}** telah di-kick. Alasan: ${reason}`);
  }

  // ── !ban ───────────────────────────────────────────────────────────────────
  else if (command === 'ban') {
    if (!message.member.permissions.has('BanMembers')) {
      return message.reply('❌ Kamu tidak punya izin untuk ban member.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag pengguna yang ingin di-ban.');
    const reason = args.slice(1).join(' ') || 'Tidak ada alasan';
    await target.ban({ reason });
    message.reply(`✅ **${target.user.tag}** telah di-ban. Alasan: ${reason}`);
  }

  // ── !clear ─────────────────────────────────────────────────────────────────
  else if (command === 'clear') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('❌ Kamu tidak punya izin untuk hapus pesan.');
    }
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ Masukkan angka antara 1 sampai 100.');
    }
    await message.channel.bulkDelete(amount + 1, true);
    message.channel.send(`✅ **${amount}** pesan telah dihapus.`).then(msg => {
      setTimeout(() => msg.delete(), 3000);
    });
  }

  // ── !join (stay 24/7) ──────────────────────────────────────────────────────
  else if (command === 'join') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ Kamu harus berada di voice channel terlebih dahulu!');
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return message.reply('❌ Bot tidak punya izin untuk masuk ke voice channel itu.');
    }

    if (voiceConnections.has(message.guild.id)) {
      voiceConnections.get(message.guild.id).destroy();
      voiceConnections.delete(message.guild.id);
    }

    const connect = () => {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          console.log(`[Voice] Reconnecting ke ${voiceChannel.name}...`);
          try { connection.destroy(); } catch {}
          voiceConnections.delete(message.guild.id);
          setTimeout(() => {
            connect();
            console.log(`[Voice] Rejoined ${voiceChannel.name}`);
          }, 3000);
        }
      });

      voiceConnections.set(message.guild.id, connection);
      return connection;
    };

    connect();
    message.reply(`✅ Bot bergabung ke **${voiceChannel.name}** dan akan stay 24/7!\nGunakan \`!leave\` untuk mengeluarkan bot.`);
  }

  // ── !leave ─────────────────────────────────────────────────────────────────
  else if (command === 'leave') {
    // Stop musik dulu jika sedang main
    if (musicQueues.has(message.guild.id)) {
      musicQueues.get(message.guild.id).player.stop();
      musicQueues.delete(message.guild.id);
    }
    const conn = getVoiceConnection(message.guild.id);
    if (conn) {
      conn.destroy();
    } else if (voiceConnections.has(message.guild.id)) {
      voiceConnections.get(message.guild.id).destroy();
      voiceConnections.delete(message.guild.id);
    } else {
      return message.reply('❌ Bot sedang tidak berada di voice channel manapun.');
    }
    message.reply('👋 Bot telah keluar dari voice channel.');
  }

  // ── !voicestatus ───────────────────────────────────────────────────────────
  else if (command === 'voicestatus') {
    const conn = getVoiceConnection(message.guild.id) || voiceConnections.get(message.guild.id);
    if (!conn) {
      return message.reply('📴 Bot tidak sedang di voice channel manapun.');
    }
    const channel = message.guild.channels.cache.get(conn.joinConfig.channelId);
    message.reply(`🔊 Bot sedang di **${channel ? channel.name : 'unknown'}** | Status: **${conn.state.status}**`);
  }

  // ── !play <url youtube> ────────────────────────────────────────────────────
  else if (command === 'play') {
    const url = args[0];
    if (!url) return message.reply('❌ Masukkan URL YouTube!\nContoh: `!play https://youtube.com/watch?v=...`');
    if (!ytdl.validateURL(url)) return message.reply('❌ URL YouTube tidak valid!');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('❌ Kamu harus berada di voice channel terlebih dahulu!');

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return message.reply('❌ Bot tidak punya izin untuk masuk ke voice channel itu.');
    }

    // Ambil info video
    let songInfo;
    try {
      songInfo = await ytdl.getInfo(url);
    } catch (err) {
      console.error('[Music] getInfo error:', err.message);
      return message.reply('❌ Gagal mengambil info video. Pastikan URL valid dan video tidak dibatasi.');
    }

    const song = {
      title: songInfo.videoDetails.title,
      url: url,
      duration: formatDuration(songInfo.videoDetails.lengthSeconds),
      requestedBy: message.author.tag,
    };

    // Kalau belum ada queue untuk guild ini
    if (!musicQueues.has(message.guild.id)) {
      const player = createAudioPlayer();
      const queue = {
        player,
        songs: [song],
        textChannel: message.channel,
        voiceChannel,
      };
      musicQueues.set(message.guild.id, queue);

      // Gabung ke voice channel
      let connection = getVoiceConnection(message.guild.id);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: true,
        });
      }
      connection.subscribe(player);

      // Event setelah lagu selesai
      player.on(AudioPlayerStatus.Idle, () => {
        const q = musicQueues.get(message.guild.id);
        if (q) {
          q.songs.shift();
          playNext(message.guild.id, message.channel);
        }
      });

      player.on('error', (err) => {
        console.error('[Music] Player error:', err.message);
        message.channel.send('❌ Terjadi error saat memutar musik.');
        const q = musicQueues.get(message.guild.id);
        if (q) {
          q.songs.shift();
          playNext(message.guild.id, message.channel);
        }
      });

      playNext(message.guild.id, message.channel);

    } else {
      // Sudah ada queue, tambahkan ke antrian
      const queue = musicQueues.get(message.guild.id);
      queue.songs.push(song);
      const embed = new EmbedBuilder()
        .setTitle('➕ Ditambahkan ke Queue')
        .setDescription(`**[${song.title}](${song.url})**`)
        .setColor(0xff0000)
        .addFields(
          { name: 'Durasi', value: song.duration, inline: true },
          { name: 'Posisi', value: `#${queue.songs.length}`, inline: true },
        )
        .setTimestamp();
      message.reply({ embeds: [embed] });
    }
  }

  // ── !skip ──────────────────────────────────────────────────────────────────
  else if (command === 'skip') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || queue.songs.length === 0) {
      return message.reply('❌ Tidak ada lagu yang sedang diputar.');
    }
    queue.player.stop();
    message.reply('⏭️ Lagu dilewati!');
  }

  // ── !stop ──────────────────────────────────────────────────────────────────
  else if (command === 'stop') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue) return message.reply('❌ Tidak ada musik yang sedang diputar.');
    queue.songs = [];
    queue.player.stop();
    musicQueues.delete(message.guild.id);
    message.reply('⏹️ Musik dihentikan dan queue dikosongkan.');
  }

  // ── !queue ─────────────────────────────────────────────────────────────────
  else if (command === 'queue') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || queue.songs.length === 0) {
      return message.reply('📭 Queue musik kosong.');
    }
    const list = queue.songs
      .slice(0, 10)
      .map((s, i) => `${i === 0 ? '▶️' : `${i}.`} **${s.title}** (${s.duration}) — ${s.requestedBy}`)
      .join('\n');
    const embed = new EmbedBuilder()
      .setTitle('🎵 Queue Musik')
      .setDescription(list)
      .setColor(0xff0000)
      .setFooter({ text: `Total: ${queue.songs.length} lagu` })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }

  // ── !nowplaying ────────────────────────────────────────────────────────────
  else if (command === 'nowplaying' || command === 'np') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || queue.songs.length === 0) {
      return message.reply('❌ Tidak ada lagu yang sedang diputar.');
    }
    const song = queue.songs[0];
    const embed = new EmbedBuilder()
      .setTitle('🎵 Sedang Diputar')
      .setDescription(`**[${song.title}](${song.url})**`)
      .setColor(0xff0000)
      .addFields(
        { name: 'Durasi', value: song.duration, inline: true },
        { name: 'Diminta oleh', value: song.requestedBy, inline: true },
      )
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
});

// ─── Helper format durasi ─────────────────────────────────────────────────────
function formatDuration(seconds) {
  const s = parseInt(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

client.login('MTI1MjkxNTI3MDE4NDM0MTUxNQ.GLNtAX.56hZ3i7xV_yXf4pik3ZL6R6m_2Dmy5CbUGSDVY');
