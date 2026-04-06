// Main application module - jQuery-free implementation
import { Chessboard, FEN, INPUT_EVENT_TYPE } from 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js';
import { Markers, MARKER_TYPE } from 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/markers/Markers.js';

// Access the Note class from music.js (loaded as a global script in index.html)
// Note: We defer accessing window.Note until it's needed in setupMusic() to ensure
// the music.js script has finished loading
function getNote() {
    if (!window.Note) {
        throw new Error('music.js library not loaded. Ensure the script is included before app.js');
    }
    return window.Note;
}

// ============= Game State =============
let board;
let chess_moves = new Chess();
let current_move = 0;
let cur_file = 0;
let moves = [];
let last_move = {};
let is_replay = false;
let timeouts = [];
const board_size = 8;
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const gameState = {
    music_type: 'samples',
    note_duration_ms: 200,
    speedup_ms: 0,
    samples_loaded: false,
    sample_names: {
        'w': '1098__pitx__spanish-guitar-notes',
        'b': '6813__menegass__bass-synth-2-octave'
    }
};

// ============= Audio State =============
let context;
let synths = [];
let volume;
let special_event_synth;
let sampleConfigs = [];
const samples = {};
const unplayableSquares = {};
const color_and_rank_to_frequency = { 'w': {}, 'b': {} };
const chessMusic = { 'w': {}, 'b': {} };

const pieceEffects = {
    'P': { gain: 0.8, synth: 0 },
    'B': { gain: 0.8, synth: 0 },
    'N': { gain: 0.8, synth: 0 },
    'R': { gain: 0.85, synth: 0 },
    'Q': { gain: 0.9, synth: 0 },
    'K': { gain: 1.0, synth: 0 }
};

// ============= Two Player Mode State =============
let game = new Chess();
const statusEl = document.getElementById('status');
const fenEl = document.getElementById('fen');
const pgnEl = document.getElementById('pgn');

// ============= Utility Functions =============
function clearTimeouts() {
    timeouts.forEach(t => clearTimeout(t));
    timeouts = [];
}

function addTimeout(func, timeout) {
    timeouts.push(setTimeout(func, timeout));
}

// ============= UI Functions =============
function flashPlayerImage(elt) {
    elt.classList.add("playerImageColor");
    addTimeout(() => elt.classList.remove("playerImageColor"), 500);
}

function highlightPlayerImages() {
    const images = document.querySelectorAll('#playerImages .playerImage');
    images.forEach((img, index) => {
        addTimeout(() => flashPlayerImage(img), 150 * (index + 1));
    });
}

function resumeAudioContext() {
    if (context && context.state === 'suspended') {
        context.resume();
    }
}

// ============= Board Setup =============
function createBoard(containerId, options = {}) {
    const container = document.getElementById(containerId);
    const defaultOptions = {
        position: FEN.start,
        assetsUrl: 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/assets/',
        style: {
            showCoordinates: false,
            aspectRatio: 1
        },
        extensions: [
            { class: Markers }
        ]
    };
    return new Chessboard(container, { ...defaultOptions, ...options });
}

// ============= Audio Setup =============
function setupMusic() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    volume = context.createGain();
    volume.gain.value = 0.8;
    volume.connect(context.destination);

    // Get the Note class from music.js
    const Note = getNote();

    // E minor pentatonic frequencies
    color_and_rank_to_frequency['w'][0] = Note.fromLatin('A3').frequency();
    color_and_rank_to_frequency['b'][7] = Note.fromLatin('A2').frequency();
    color_and_rank_to_frequency['w'][1] = Note.fromLatin('C3').frequency();
    color_and_rank_to_frequency['b'][6] = Note.fromLatin('C2').frequency();
    color_and_rank_to_frequency['w'][2] = Note.fromLatin('D3').frequency();
    color_and_rank_to_frequency['b'][5] = Note.fromLatin('D2').frequency();
    color_and_rank_to_frequency['w'][3] = Note.fromLatin('E3').frequency();
    color_and_rank_to_frequency['b'][4] = Note.fromLatin('E2').frequency();
    color_and_rank_to_frequency['w'][4] = Note.fromLatin('G3').frequency();
    color_and_rank_to_frequency['b'][3] = Note.fromLatin('G2').frequency();
    color_and_rank_to_frequency['w'][5] = Note.fromLatin('A4').frequency();
    color_and_rank_to_frequency['b'][2] = Note.fromLatin('A3').frequency();
    color_and_rank_to_frequency['w'][6] = Note.fromLatin('C4').frequency();
    color_and_rank_to_frequency['b'][1] = Note.fromLatin('C3').frequency();
    color_and_rank_to_frequency['w'][7] = Note.fromLatin('D4').frequency();
    color_and_rank_to_frequency['b'][0] = Note.fromLatin('D3').frequency();

    // Mark initial piece positions as unplayable
    for (let i = 0; i < files.length; i++) {
        unplayableSquares[files[i] + '1'] = 1;
        unplayableSquares[files[i] + '2'] = 1;
        unplayableSquares[files[i] + '7'] = 1;
        unplayableSquares[files[i] + '8'] = 1;
    }
}

function disconnectSynths() {
    for (let j = 0; j < files.length; j++) {
        if (typeof synths[j] !== 'undefined') {
            stopNote(j);
        }
    }
    if (typeof special_event_synth !== 'undefined') {
        special_event_synth.disconnect();
    }
}

function stopNote(rank) {
    if (synths[rank] && synths[rank].sub_volume) {
        synths[rank].sub_volume.gain.value = 0.0;
    }
}

// ============= Sample Loading =============
function loadSample(sampleDir, sample) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'samples/' + sampleDir + '/' + sample.file, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
        const buffer = xhr.response;
        if (buffer) {
            decodeSample(buffer, sampleDir, sample);
        }
    };
    xhr.onerror = function() {
        alert('failed to load sample ' + sampleDir + '/' + sample.file);
    };
    xhr.send();
}

function decodeSample(sampleData, sampleDir, sample) {
    context.decodeAudioData(
        sampleData,
        (decodedData) => storeSampleBuffer(decodedData, sampleDir, sample),
        (error) => alert('Error decoding ' + sampleDir + '/' + sample.file)
    );
}

function storeSampleBuffer(buffer, sampleDir, sample) {
    if (!buffer) {
        alert('Error decoding ' + sampleDir + '/' + sample.file);
        return;
    }
    samples[sampleDir]['notes'][sample.note] = buffer;
    samples[sampleDir]['to_load'].pop();
    if (samples[sampleDir]['to_load'].length === 0) {
        console.log('All samples for ' + sampleDir + ' loaded and decoded');
        delete samples[sampleDir]['to_load'];
        gameState.samples_loaded = true;
    }
}

function setupNotes() {
    // Get the Note class from music.js
    const Note = getNote();

    switch (gameState.music_type) {
        case 'samples':
            sampleConfigs.forEach(val => {
                if (val.dir === gameState.sample_names['w']) {
                    chessMusic['w'].rootNote = val.rootNote;
                    chessMusic['w'].rootOctave = val.rootOctave;
                } else if (val.dir === gameState.sample_names['b']) {
                    chessMusic['b'].rootNote = val.rootNote;
                    chessMusic['b'].rootOctave = val.rootOctave;
                }
            });
            break;
        case 'oscillator':
        default:
            chessMusic['w'].rootNote = 'A';
            chessMusic['w'].rootOctave = 3;
            chessMusic['b'].rootNote = 'A';
            chessMusic['b'].rootOctave = 2;
            break;
    }
    chessMusic['w'].lowNotes = Note.fromLatin(chessMusic['w'].rootNote + chessMusic['w'].rootOctave).scale('minor pentatonic');
    chessMusic['w'].midNotes = Note.fromLatin(chessMusic['w'].rootNote + (chessMusic['w'].rootOctave + 1)).scale('minor pentatonic');
    chessMusic['w'].highNotes = Note.fromLatin(chessMusic['w'].rootNote + (chessMusic['w'].rootOctave + 2)).scale('minor pentatonic');
    chessMusic['b'].lowNotes = Note.fromLatin(chessMusic['b'].rootNote + chessMusic['b'].rootOctave).scale('minor pentatonic');
    chessMusic['b'].midNotes = Note.fromLatin(chessMusic['b'].rootNote + (chessMusic['b'].rootOctave + 1)).scale('minor pentatonic');
    chessMusic['b'].highNotes = Note.fromLatin(chessMusic['b'].rootNote + (chessMusic['b'].rootOctave + 2)).scale('minor pentatonic');
}

async function loadSamplesConfig() {
    try {
        const response = await fetch('samples/samples.json');
        const data = await response.json();
        sampleConfigs = data;
        data.forEach((val, key) => {
            console.log(val.dir);
            const sampleDir = val.dir;
            samples[sampleDir] = {};
            samples[sampleDir]['notes'] = {};
            samples[sampleDir]['config_index'] = key;
            samples[sampleDir]['to_load'] = [];
            val.samples.forEach(sample => {
                samples[sampleDir]['to_load'].push(sample.file);
                loadSample(sampleDir, sample);
            });
        });
        setupNotes();
    } catch (error) {
        console.error('Error loading samples config:', error);
    }
}

// ============= Music Playback =============
function getNoteForRankAndColor(rank, color) {
    if (color === 'w') {
        if (rank < chessMusic[color].midNotes.length) {
            return chessMusic[color].midNotes[rank];
        }
        return chessMusic[color].highNotes[rank - chessMusic[color].midNotes.length];
    }
    if (color === 'b') {
        if (rank < chessMusic[color].lowNotes.length) {
            return chessMusic[color].lowNotes[rank];
        }
        return chessMusic[color].midNotes[rank - chessMusic[color].lowNotes.length];
    }
}

function playSquare(square, color, piece) {
    const rank = parseInt(square.substring(1, 2)) - 1;
    const note = getNoteForRankAndColor(rank, color);
    switch (gameState.music_type) {
        case "samples":
            playSample(rank, note, piece, color);
            break;
        case "oscillator":
        default:
            playOscillator(rank, note, piece, color);
            break;
    }
}

function playOscillator(rank, note, piece, color) {
    const freq = note.frequency();
    const sub_volume = context.createGain();
    sub_volume.connect(volume);
    sub_volume.gain.value = pieceEffects[piece].gain;
    synths[rank] = context.createOscillator();
    synths[rank].connect(sub_volume);
    synths[rank].type = pieceEffects[piece].synth;
    synths[rank].frequency.value = freq;
    synths[rank].sub_volume = sub_volume;
    synths[rank].start(0);
}

function playSample(rank, note, piece, color) {
    const sub_volume = context.createGain();
    sub_volume.connect(volume);
    sub_volume.gain.value = pieceEffects[piece].gain;
    const latinNote = note.latin() + '' + note.octave();
    synths[rank] = context.createBufferSource();
    synths[rank].sub_volume = sub_volume;
    synths[rank].buffer = samples[gameState.sample_names[color]]['notes'][latinNote];
    synths[rank].connect(sub_volume);
    synths[rank].start(0);
}

// ============= Board Position Helpers =============
// Convert cm-chessboard position format to the format we need
function getBoardPosition() {
    const fen = board.getPosition();
    const position = {};
    
    // Parse FEN position part only (before the first space)
    const positionPart = fen.split(' ')[0];
    const rows = positionPart.split('/');
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    
    rows.forEach((row, rowIndex) => {
        let fileIndex = 0;
        for (const char of row) {
            if (/\d/.test(char)) {
                fileIndex += parseInt(char);
            } else {
                const file = files[fileIndex];
                const rank = ranks[rowIndex];
                const square = file + rank;
                const color = char === char.toUpperCase() ? 'w' : 'b';
                const piece = char.toUpperCase();
                position[square] = color + piece;
                fileIndex++;
            }
        }
    });
    
    return position;
}

// Custom marker types for flash effects
const FLASH_MARKER = {
    class: "marker-flash",
    slice: "markerSquare"
};

const CAPTURE_MARKER = {
    class: "marker-capture", 
    slice: "markerSquare"
};

function flashSquare(square, is_capture) {
    // Use cm-chessboard's marker extension for visual feedback
    const markerType = is_capture ? CAPTURE_MARKER : FLASH_MARKER;
    
    try {
        board.addMarker(markerType, square);
        // Remove marker after animation duration
        addTimeout(() => {
            try {
                board.removeMarkers(markerType, square);
            } catch (e) {
                // Marker may already be removed
            }
        }, 210);
    } catch (e) {
        // Board may not support markers or square invalid
        console.log('Could not add marker:', e);
    }
}

function isCurrentMoveLastMove(cur_move) {
    const cur_from = cur_move.from;
    const cur_to = cur_move.to;
    const last_from = last_move.from;
    const last_to = last_move.to;
    return (last_to === cur_to && last_from === cur_from);
}

function playPosition(cur_move) {
    playRankInFile(cur_move);
}

function playRankInFile(cur_move) {
    const cur_position = getBoardPosition();
    for (let i = 1; i < 9; i++) {
        const cur_square = files[cur_file] + '' + i;
        if (cur_position[cur_square]) {
            const color = cur_position[cur_square].substring(0, 1);
            const piece = cur_position[cur_square].substring(1, 2);
            if (unplayableSquares[cur_move.from]) {
                delete unplayableSquares[cur_move.from];
            }
            if (unplayableSquares[cur_square] !== 1) {
                let is_capture = false;
                if (cur_move.captured && cur_move.to === cur_square && !isCurrentMoveLastMove(cur_move)) {
                    is_capture = true;
                }
                if (typeof synths[i - 1] !== 'undefined') {
                    stopNote(i - 1);
                }
                playSquare(cur_square, color, piece);
                flashSquare(cur_square, is_capture);
            }
        }
    }
    cur_file = cur_file + 1;
    if (cur_file < files.length) {
        addTimeout(() => playRankInFile(cur_move), gameState.note_duration_ms);
    } else {
        cur_file = 0;
        addTimeout(() => stopNotes(cur_move), gameState.note_duration_ms);
    }
}

function stopNotes(cur_move) {
    disconnectSynths();
    if (is_replay) {
        movePiece();
    } else {
        last_move = cur_move;
        const cm = moves[moves.length - 1];
        playPosition(cm);
    }
}

// ============= Game Control =============
function movePiece() {
    const i = current_move;
    if (i >= moves.length) {
        return;
    }
    if (current_move - 1 > 0) {
        last_move = moves[current_move - 1];
    } else {
        last_move = moves[current_move];
    }
    
    // Move the piece using cm-chessboard
    board.movePiece(moves[i].from, moves[i].to, true);
    
    const rank = moves[i].from.substring(1, 2);
    // Handle castling
    if (moves[i].san === "O-O") {
        if (rank === '1') {
            board.movePiece('h1', 'f1', true);
        } else {
            board.movePiece('h8', 'f8', true);
        }
    } else if (moves[i].san === "O-O-O") {
        if (rank === '1') {
            board.movePiece('a1', 'd1', true);
        } else {
            board.movePiece('a8', 'd8', true);
        }
    }
    
    // Handle captures - remove captured piece
    if (moves[i].captured) {
        // The piece at the target square is captured
        // cm-chessboard handles this automatically with movePiece
    }
    
    playPosition(moves[i]);
    gameState.note_duration_ms = gameState.note_duration_ms - gameState.speedup_ms;
    
    // Update PGN display
    let text = pgnEl.textContent;
    if (current_move % 2 === 0) {
        let display_move = current_move / 2 + 1;
        text = text + ' ' + display_move + '. ';
    }
    pgnEl.textContent = text + ' ' + moves[i].san;

    current_move = current_move + 1;
}

function resetState() {
    if (board) {
        board.destroy();
    }
    board = createBoard('board1');
    
    document.querySelectorAll('img.playerImage').forEach(img => {
        img.classList.remove("playerImageColor");
    });
    
    clearTimeouts();
    is_replay = false;
    disconnectSynths();
    moves = [];
    last_move = {};
    current_move = 0;
    cur_file = 0;
    gameState.note_duration_ms = 200;
    chess_moves = new Chess();
    game = new Chess();
    setupMusic();
}

// ============= Two Player Mode =============
function updateStatus() {
    let status = '';
    let moveColor = 'White';
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }

    if (game.in_checkmate()) {
        status = 'Game over, ' + moveColor + ' is in checkmate.';
    } else if (game.in_draw()) {
        status = 'Game over, drawn position';
    } else {
        status = moveColor + ' to move';
        if (game.in_check()) {
            status += ', ' + moveColor + ' is in check';
        }
    }

    statusEl.innerHTML = status;
    fenEl.innerHTML = game.fen();
    pgnEl.innerHTML = game.pgn();
}

function twoPlayerInputHandler(event) {
    if (event.type === INPUT_EVENT_TYPE.moveInputStarted) {
        const piece = event.piece;
        // Only pick up pieces for the side to move
        if (game.game_over()) {
            return false;
        }
        if ((game.turn() === 'w' && piece.startsWith('b')) ||
            (game.turn() === 'b' && piece.startsWith('w'))) {
            return false;
        }
        return true;
    } else if (event.type === INPUT_EVENT_TYPE.validateMoveInput) {
        // Try to make the move
        const move = game.move({
            from: event.squareFrom,
            to: event.squareTo,
            promotion: 'q' // Always promote to queen for simplicity
        });

        if (move === null) {
            return false; // illegal move
        }

        moves.push(move);
        console.log(moves.length);
        if (moves.length === 1) {
            playPosition(move); // first move was made, start the music
        }

        updateStatus();
        return true;
    }
}

// ============= Game Modes =============
// Make replayGame available globally for onclick handlers
window.replayGame = function(element, player_name) {
    resumeAudioContext();
    resetState();
    element.classList.add("playerImageColor");
    chess_moves.load_pgn(pgns[player_name].join('\n'));
    moves = chess_moves.history({ verbose: true });
    is_replay = true;
    
    // Destroy existing board and create a new one
    if (board) {
        board.destroy();
    }
    board = createBoard('board1');
    
    gameState.speedup_ms = Math.floor((gameState.note_duration_ms / 2) / moves.length);
    addTimeout(movePiece, gameState.note_duration_ms * board_size);
};

window.twoPlayer = function() {
    resumeAudioContext();
    resetState();
    
    if (board) {
        board.destroy();
    }
    board = createBoard('board1');
    board.enableMoveInput(twoPlayerInputHandler);
    updateStatus();
};

// ============= Initialization =============
function init() {
    resetState();
    loadSamplesConfig();
    highlightPlayerImages();

    // Add touch/click event listener to resume audio context
    document.body.addEventListener('touchstart', resumeAudioContext, { once: true });
    document.body.addEventListener('click', resumeAudioContext, { once: true });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
