const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your frontend
    methods: ['GET', 'POST']
  }
});

// In-memory game state (replace with DB later)
const games = {}; // { GAME_CODE: { players: [], hostId, promptIds, ... } }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('create-game', ({ player, gameCode }, callback) => {
    games[gameCode] = {
      players: [player],
      hostId: player.id,
      promptIds: [],
      status: 'lobby',
    };
    socket.join(gameCode);
    callback({ success: true });
    io.to(gameCode).emit('player-list', games[gameCode].players);
  });

  socket.on('join-game', ({ player, gameCode }, callback) => {
    const game = games[gameCode];
    if (!game) return callback({ success: false, message: 'Game not found' });

    game.players.push(player);
    socket.join(gameCode);
    callback({ success: true });
    io.to(gameCode).emit('player-list', game.players);
  });

  socket.on('start-game', ({ gameCode, promptIds }) => {
    const game = games[gameCode];
    if (!game) return;
    game.status = 'playing';
    game.promptIds = promptIds;
    io.to(gameCode).emit('game-started', { promptIds });
  });

  socket.on('submit-vote', ({ gameCode, playerId, vote }) => {
    const game = games[gameCode];
    if (!game) return;
    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.vote = vote;
      player.hasVoted = true;
    }
    io.to(gameCode).emit('player-voted', game.players);

    const allVoted = game.players.every(p => p.hasVoted);
    if (allVoted) {
      io.to(gameCode).emit('all-voted', game.players);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Optional: remove from games
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});