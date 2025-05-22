require("dotenv").config();

module.exports = {
    prefix: '!',
    nodes: [
        {
            host: "78.46.65.243",
            password: "youshallnotpass",
            port: 4386,
            secure: false,
            name: "Main Node"
        }
    ],
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    },
    botToken: process.env.BOT_TOKEN,
    embedColor: "#0061ff"
};
