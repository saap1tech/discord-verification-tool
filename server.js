require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { OAuth2Client } = require('google-auth-library');
const OAuth2 = require('discord-oauth2');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const discordOAuth = new OAuth2();

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
bot.login(process.env.DISCORD_BOT_TOKEN);

const verifiedUsers = new Set();

app.post('/verify/google', async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (payload.email.endsWith('@ensnn.dz')) {
      res.json({ valid: true, email: payload.email });
    } else {
      res.status(400).json({ valid: false, message: 'Invalid email domain' });
    }
  } catch (error) {
    res.status(400).json({ valid: false, message: 'Verification failed' });
  }
});

app.get('/discord/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const tokenResponse = await discordOAuth.tokenRequest({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      code,
      grantType: 'authorization_code',
      redirectUri: process.env.REDIRECT_URI,
      scope: 'identify guilds.join',
    });

    const user = await discordOAuth.getUser(tokenResponse.access_token);

    verifiedUsers.add(user.id);

    const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const member = await guild.members.add(user.id, {
      accessToken: tokenResponse.access_token,
    });

    const role = guild.roles.cache.find((r) => r.name === 'Verified');
    if (role) await member.roles.add(role);

    res.send('Success! You can go to our discord server');
  } catch (error) {
    console.error(error);
    res.status(400).send('Discord verification failed');
  }
});

bot.on('guildMemberAdd', async (member) => {
  if (!verifiedUsers.has(member.id)) {
    const verificationLink = 'http://localhost:3000';
    await member.send(`Please verify your email here: ${verificationLink}`);
    await member.kick('Not verified');
  }
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});