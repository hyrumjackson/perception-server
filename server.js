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
      currentRound: 1,
      roundCount: 5,
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

  socket.on('enter-settings', ({ gameCode }) => {
    const game = games[gameCode];
    if (!game) return;

    game.status = 'settings';
    io.to(gameCode).emit('status-update', { status: 'settings' });
  });

  socket.on('start-game', ({ gameCode, promptIds, promptGen, roundCount, hostId }) => {
    const game = games[gameCode];
    if (!game) return;
    game.status = 'playing';
    game.promptIds = promptIds;
    game.promptGen = promptGen;
    game.roundCount = roundCount;
    game.currentRound = 1;
    game.hostId = hostId;

    io.to(gameCode).emit('game-started', {
      promptIds,
      promptGen,
      roundCount,
      currentRound: 1,
      status: 'intro',
      hostId,
    });
  });

  socket.on('start-round', ({ gameCode }) => {
    const game = games[gameCode];
    if (!game) return;

    game.status = 'playing';

    io.to(gameCode).emit('round-data', {
      updatedPlayers: game.players,
      currentRound: game.currentRound,
      isGameOver: false,
      promptIds: game.promptIds,
      promptGen: game.promptGen,
      roundCount: game.roundCount,
      status: 'playing',
      hostId: game.hostId,
    });
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
      game.status = 'results';
      io.to(gameCode).emit('all-voted', {
        updatedPlayers: game.players,
        currentRound: game.currentRound,
        isGameOver: false,
        promptIds: game.promptIds,
        promptGen: game.promptGen,
        roundCount: game.roundCount,
        status: game.status,
        hostId: game.hostId,
      });
    }
  });

  socket.on('next-round', ({ gameCode }) => {
    const game = games[gameCode];
    if (!game) return;

    game.currentRound += 1;

    // Reset votes
    game.players.forEach(p => {
      p.vote = null;
      p.hasVoted = false;
    });

    // If it's the final round
    if (game.currentRound > game.roundCount) {
      game.status = 'final';
    } else {
      game.status = 'playing';
    }

    io.to(gameCode).emit('round-data', {
      updatedPlayers: game.players,
      currentRound: game.currentRound,
      isGameOver: game.currentRound > game.roundCount,
      promptIds: game.promptIds,
      promptGen: game.promptGen,
      roundCount: game.roundCount,
      status: game.status,
      hostId: game.hostId,
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Optional: remove from games
  });

  socket.on('restart-game', ({ gameCode, updatedPlayers, promptIds }) => {
    const game = games[gameCode];
    if (!game) return;
    game.players = updatedPlayers;
    game.promptIds = promptIds;
    game.currentRound = 1;
    game.status = 'intro';
    io.to(gameCode).emit('restart-game', { updatedPlayers, promptIds });
  });

  socket.on('end-game', ({ gameCode }) => {
    delete games[gameCode];
    io.to(gameCode).emit('end-game');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});