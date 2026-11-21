
require("dotenv").config();

const express = require("express");
const {
    AccessToken,
    RoomServiceClient
} = require("livekit-server-sdk");

const { randomUUID } = require("crypto");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const ROOM_NAME = "sasha-fm";
const BROADCASTER_ID = "sasha-fm-broadcaster";

// Check that all credentials are present.
const requiredEnv = [
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET"
];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`Missing environment variable: ${key}`);
        process.exit(1);
    }
}

// Configure LiveKit room service.
const livekitHttpUrl = process.env.LIVEKIT_URL
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:");

const roomService = new RoomServiceClient(
    livekitHttpUrl,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
);

// Health check.
app.get("/health", (req, res) => {
    res.json({
        status: "online",
        service: "SASHA.FM token server"
    });
});

// Check whether the broadcaster is connected.

// Check whether the broadcaster is connected.
app.get("/status", async (req, res) => {
    try {
        const participants = await roomService.listParticipants(
            ROOM_NAME
        );

        const broadcasting = participants.some(
            participant =>
                participant.identity === BROADCASTER_ID
        );

        res.json({
            broadcasting,
            room: ROOM_NAME
        });

    } catch (error) {

        // A room that doesn't exist simply means nobody is broadcasting.
        if (error.code === "not_found" || error.status === 404) {
            return res.json({
                broadcasting: false,
                room: ROOM_NAME
            });
        }

        console.error("Broadcast status check failed:", error);

        res.status(503).json({
            broadcasting: false,
            error: "Could not check broadcaster status"
        });
    }
});


// Generate LiveKit access tokens.
app.post("/token", async (req, res) => {
    try {
        const { role } = req.body;

        if (role !== "broadcaster" && role !== "listener") {
            return res.status(400).json({
                error: "Role must be broadcaster or listener"
            });
        }

        const identity = role === "broadcaster"
            ? BROADCASTER_ID
            : `listener-${randomUUID()}`;

        const token = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity,
                ttl: 3600
            }
        );

        token.addGrant({
            roomJoin: true,
            room: ROOM_NAME,
            canPublish: role === "broadcaster",
            canSubscribe: true
        });

        const jwt = await token.toJwt();

        res.json({
            serverUrl: process.env.LIVEKIT_URL,
            room: ROOM_NAME,
            identity,
            token: jwt
        });

    } catch (error) {
        console.error("Token generation failed:", error);

        res.status(500).json({
            error: "Could not generate access token"
        });
    }
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(
        `SASHA.FM token server running on http://127.0.0.1:${PORT}`
    );
});
