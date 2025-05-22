require("dotenv").config();

module.exports = {
    prefix: '!',
    nodes: [
        {
            host: "160.191.77.60",
            password: "dsc.gg/cortexrealm",
            port: 10065,
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
