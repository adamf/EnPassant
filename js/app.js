// Main application module - jQuery-free implementation
import { Chessboard, FEN, INPUT_EVENT_TYPE } from 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js';
import { Markers, MARKER_TYPE } from 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/markers/Markers.js';
import { Soundfont } from 'https://cdn.jsdelivr.net/npm/smplr@0.20.0/dist/index.mjs';

// Curated subset of General MIDI Soundfont instruments (gleitz/midi-js-soundfonts)
const INSTRUMENTS = [
    { id: 'acoustic_grand_piano',    label: 'Grand Piano' },
    { id: 'electric_piano_1',        label: 'Electric Piano' },
    { id: 'harpsichord',             label: 'Harpsichord' },
    { id: 'celesta',                 label: 'Celesta' },
    { id: 'music_box',               label: 'Music Box' },
    { id: 'vibraphone',              label: 'Vibraphone' },
    { id: 'marimba',                 label: 'Marimba' },
    { id: 'xylophone',               label: 'Xylophone' },
    { id: 'tubular_bells',           label: 'Tubular Bells' },
    { id: 'church_organ',            label: 'Church Organ' },
    { id: 'drawbar_organ',           label: 'Drawbar Organ' },
    { id: 'accordion',               label: 'Accordion' },
    { id: 'acoustic_guitar_nylon',   label: 'Nylon Guitar' },
    { id: 'acoustic_guitar_steel',   label: 'Steel Guitar' },
    { id: 'electric_guitar_clean',   label: 'Electric Guitar' },
    { id: 'acoustic_bass',           label: 'Acoustic Bass' },
    { id: 'electric_bass_finger',    label: 'Electric Bass' },
    { id: 'violin',                  label: 'Violin' },
    { id: 'cello',                   label: 'Cello' },
    { id: 'contrabass',              label: 'Contrabass' },
    { id: 'pizzicato_strings',       label: 'Pizzicato Strings' },
    { id: 'orchestral_harp',         label: 'Harp' },
    { id: 'string_ensemble_1',       label: 'String Ensemble' },
    { id: 'choir_aahs',              label: 'Choir' },
    { id: 'trumpet',                 label: 'Trumpet' },
    { id: 'french_horn',             label: 'French Horn' },
    { id: 'tuba',                    label: 'Tuba' },
    { id: 'alto_sax',                label: 'Alto Sax' },
    { id: 'clarinet',                label: 'Clarinet' },
    { id: 'flute',                   label: 'Flute' },
    { id: 'pan_flute',               label: 'Pan Flute' },
    { id: 'ocarina',                 label: 'Ocarina' },
    { id: 'pad_2_warm',              label: 'Warm Pad' },
    { id: 'kalimba',                 label: 'Kalimba' },
    { id: 'koto',                    label: 'Koto' },
    { id: 'sitar',                   label: 'Sitar' },
    { id: 'banjo',                   label: 'Banjo' },
    { id: 'steel_drums',             label: 'Steel Drums' },
    { id: 'timpani',                 label: 'Timpani' }
];

// Access Tonal.js (loaded as a global script in index.html)
// Returns null if Tonal is not loaded
function getTonal() {
    return window.Tonal || null;
}

// ============= Game State =============
let board;
let chess_moves = new Chess();
let current_move = 0;
let cur_file = 0;
let moves = [];
let last_move = {};
let is_replay = false;
let is_finale = false;
let timeouts = [];
const board_size = 8;
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const gameState = {
    music_type: 'samples',
    note_duration_ms: 200,
    base_tempo_ms: 200,
    speedup_ms: 0,
    instrument_names: {
        'w': 'acoustic_grand_piano',
        'b': 'acoustic_bass'
    },
    octave: { w: 3, b: 2 }
};

// ============= Audio State =============
let context;
let synths = [];
let volume;
let compressor;
let special_event_synth;
const instrumentCache = {};
const activeInstruments = { w: null, b: null };
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

// ============= Sequencer visualization =============
const beatBarEl = document.getElementById('beatBar');
const whiteColEl = document.getElementById('whiteColumn');
const blackColEl = document.getElementById('blackColumn');

function buildSequencerUI() {
    if (beatBarEl && beatBarEl.childElementCount === 0) {
        for (let i = 0; i < files.length; i++) {
            const cell = document.createElement('div');
            cell.className = 'beatCell';
            beatBarEl.appendChild(cell);
        }
    }
    [whiteColEl, blackColEl].forEach(col => {
        if (col && col.childElementCount === 0) {
            for (let i = 0; i < 8; i++) {
                const cell = document.createElement('div');
                cell.className = 'noteCell';
                col.appendChild(cell);
            }
        }
    });
}

function flashBeat(fileIndex) {
    if (!beatBarEl) return;
    const cell = beatBarEl.children[fileIndex];
    if (!cell) return;
    cell.classList.add('active');
    addTimeout(() => cell.classList.remove('active'), Math.max(80, gameState.note_duration_ms - 20));
}

function flashNoteCell(color, rankIndex) {
    const col = color === 'w' ? whiteColEl : blackColEl;
    if (!col) return;
    const cell = col.children[rankIndex];
    if (!cell) return;
    cell.classList.add('active');
    addTimeout(() => cell.classList.remove('active'), Math.max(80, gameState.note_duration_ms - 20));
}

function clearSequencerHighlights() {
    document.querySelectorAll('.beatCell.active, .noteCell.active')
        .forEach(el => el.classList.remove('active'));
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
            showCoordinates: false
        },
        extensions: [
            { class: Markers }
        ]
    };
    return new Chessboard(container, { ...defaultOptions, ...options });
}

// ============= Audio Setup =============
function setupMusic() {
    if (context) {
        // Audio graph is one-shot; just re-mark starting squares and return.
        for (let i = 0; i < files.length; i++) {
            unplayableSquares[files[i] + '1'] = 1;
            unplayableSquares[files[i] + '2'] = 1;
            unplayableSquares[files[i] + '7'] = 1;
            unplayableSquares[files[i] + '8'] = 1;
        }
        return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    volume = context.createGain();
    volume.gain.value = 0.6;
    // Compressor tames the low-octave bass samples which otherwise clip
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    volume.connect(compressor);
    compressor.connect(context.destination);

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

function stopAllInstruments() {
    ['w', 'b'].forEach(c => {
        const sf = activeInstruments[c];
        if (sf && typeof sf.stop === 'function') {
            try { sf.stop(); } catch (e) { /* ignore */ }
        }
    });
}

function stopNote(rank) {
    if (synths[rank] && synths[rank].sub_volume) {
        // Short fade-out to avoid clicks. On the final move let notes ring out.
        const gain = synths[rank].sub_volume.gain;
        const now = context.currentTime;
        const fade = is_finale ? 3.0 : 0.02;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0.0, now + fade);
    }
}

// ============= Instrument Loading (smplr Soundfont) =============
function getInstrument(name) {
    if (instrumentCache[name]) return instrumentCache[name];
    const sf = new Soundfont(context, { instrument: name, destination: volume });
    instrumentCache[name] = sf;
    return sf;
}

async function setInstrument(color, name) {
    gameState.instrument_names[color] = name;
    const sf = getInstrument(name);
    try {
        await sf.load;
        activeInstruments[color] = sf;
    } catch (e) {
        console.error('Failed to load instrument', name, e);
    }
}

async function loadDefaultInstruments() {
    await Promise.all([
        setInstrument('w', gameState.instrument_names['w']),
        setInstrument('b', gameState.instrument_names['b'])
    ]);
}

function setupNotes() {
    // Get Tonal library
    const Tonal = getTonal();

    // With Soundfont handling pitch across the full keyboard we use a
    // fixed E-minor-pentatonic layout independent of the instrument.
    // gameState.octave.{w,b} picks the absolute starting octave per side.
    chessMusic['w'].rootNote = 'E';
    chessMusic['w'].rootOctave = gameState.octave.w;
    chessMusic['b'].rootNote = 'E';
    chessMusic['b'].rootOctave = gameState.octave.b;
    
    // Generate scale notes using Tonal.js
    if (Tonal) {
        const getScaleNotes = (rootNote, rootOctave) => {
            // Get minor pentatonic scale notes starting from root
            const scaleName = rootNote + ' minor pentatonic';
            const scaleNotes = Tonal.Scale.get(scaleName).notes;
            // Return note objects with cached frequency and latin note name
            return scaleNotes.map(note => ({
                name: note,
                octave: rootOctave,
                freq: Tonal.Note.freq(note + rootOctave),
                latin: note,
                frequency: function() { return this.freq; }
            }));
        };
        
        chessMusic['w'].lowNotes = getScaleNotes(chessMusic['w'].rootNote, chessMusic['w'].rootOctave);
        chessMusic['w'].midNotes = getScaleNotes(chessMusic['w'].rootNote, chessMusic['w'].rootOctave + 1);
        chessMusic['w'].highNotes = getScaleNotes(chessMusic['w'].rootNote, chessMusic['w'].rootOctave + 2);
        chessMusic['b'].lowNotes = getScaleNotes(chessMusic['b'].rootNote, chessMusic['b'].rootOctave);
        chessMusic['b'].midNotes = getScaleNotes(chessMusic['b'].rootNote, chessMusic['b'].rootOctave + 1);
        chessMusic['b'].highNotes = getScaleNotes(chessMusic['b'].rootNote, chessMusic['b'].rootOctave + 2);
    } else {
        // Fallback with hardcoded minor pentatonic scale notes and frequencies
        // Minor pentatonic intervals from root: root, m3, P4, P5, m7
        const getMinorPentatonicNotes = (rootNote) => {
            const noteOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
            const rootIndex = noteOrder.indexOf(rootNote);
            if (rootIndex === -1) return ['A', 'C', 'D', 'E', 'G']; // Default to A minor pentatonic
            // Minor pentatonic: root, m3 (3 semitones), P4 (5), P5 (7), m7 (10)
            // For simplicity, use the hardcoded A minor pentatonic pattern
            return ['A', 'C', 'D', 'E', 'G'];
        };
        
        const createFallbackNotes = (rootNote, rootOctave) => {
            const minorPentatonic = getMinorPentatonicNotes(rootNote);
            // Base frequencies at octave 2
            const baseFreqs = { 'A': 110, 'C': 130.81, 'D': 146.83, 'E': 164.81, 'G': 196 };
            return minorPentatonic.map(note => {
                const freq = baseFreqs[note] * Math.pow(2, rootOctave - 2);
                return {
                    name: note,
                    octave: rootOctave,
                    freq: freq,
                    latin: note,
                    frequency: function() { return this.freq; }
                };
            });
        };
        
        const wRoot = chessMusic['w'].rootNote || 'A';
        const bRoot = chessMusic['b'].rootNote || 'A';
        chessMusic['w'].lowNotes = createFallbackNotes(wRoot, chessMusic['w'].rootOctave || 3);
        chessMusic['w'].midNotes = createFallbackNotes(wRoot, (chessMusic['w'].rootOctave || 3) + 1);
        chessMusic['w'].highNotes = createFallbackNotes(wRoot, (chessMusic['w'].rootOctave || 3) + 2);
        chessMusic['b'].lowNotes = createFallbackNotes(bRoot, chessMusic['b'].rootOctave || 2);
        chessMusic['b'].midNotes = createFallbackNotes(bRoot, (chessMusic['b'].rootOctave || 2) + 1);
        chessMusic['b'].highNotes = createFallbackNotes(bRoot, (chessMusic['b'].rootOctave || 2) + 2);
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
    // Short fade-in to avoid click
    const target = pieceEffects[piece].gain;
    const now = context.currentTime;
    sub_volume.gain.setValueAtTime(0, now);
    sub_volume.gain.linearRampToValueAtTime(target, now + 0.01);
    synths[rank] = context.createOscillator();
    synths[rank].connect(sub_volume);
    synths[rank].type = pieceEffects[piece].synth;
    synths[rank].frequency.value = freq;
    synths[rank].sub_volume = sub_volume;
    synths[rank].start(0);
}

function playSample(rank, note, piece, color) {
    const sf = activeInstruments[color];
    if (!sf) return;
    const latinNote = note.latin + '' + note.octave;
    const now = context.currentTime;
    const duration = is_finale
        ? 3.5
        : Math.max(0.15, (gameState.note_duration_ms * board_size) / 1000);
    sf.start({
        note: latinNote,
        time: now,
        duration,
        velocity: Math.round(90 * pieceEffects[piece].gain)
    });
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
    flashBeat(cur_file);
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
                flashNoteCell(color, i - 1);
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

function playFinaleChord() {
    // Sustained pentatonic chord on both voices to resolve the game.
    const playColorChord = (color) => {
        const scale = chessMusic[color].midNotes;
        if (!scale || !scale.length) return;
        const sf = activeInstruments[color];
        [0, 2, 4].forEach((idx, i) => {
            const note = scale[idx] || scale[0];
            const latinNote = note.latin + '' + note.octave;
            const time = context.currentTime + i * 0.12;
            if (gameState.music_type === 'samples' && sf) {
                sf.start({ note: latinNote, time, duration: 4.0, velocity: 85 });
            } else {
                const sub_volume = context.createGain();
                sub_volume.connect(volume);
                sub_volume.gain.setValueAtTime(0, time);
                sub_volume.gain.linearRampToValueAtTime(0.5, time + 0.02);
                sub_volume.gain.linearRampToValueAtTime(0, time + 3.5);
                const osc = context.createOscillator();
                osc.type = 0;
                osc.frequency.value = note.frequency();
                osc.connect(sub_volume);
                osc.start(time);
                osc.stop(time + 3.6);
            }
        });
    };
    playColorChord('w');
    playColorChord('b');
}

function stopNotes(cur_move) {
    disconnectSynths();
    if (is_finale) {
        playFinaleChord();
        is_finale = false;
        return;
    }
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
    if (i === moves.length - 1) {
        is_finale = true;
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
    
    // Update PGN ticker: emit spans so the latest move can flash brightly.
    if (current_move % 2 === 0) {
        const display_move = current_move / 2 + 1;
        const numSpan = document.createElement('span');
        numSpan.className = 'moveNum';
        numSpan.textContent = display_move + '.';
        pgnEl.appendChild(numSpan);
    }
    // Demote previous "latest" move
    const prev = pgnEl.querySelector('.move.moveLatest');
    if (prev) {
        // Force a reflow so the transition kicks in when we remove the class
        // eslint-disable-next-line no-unused-expressions
        prev.offsetWidth;
        prev.classList.remove('moveLatest');
    }
    const moveSpan = document.createElement('span');
    moveSpan.className = 'move moveLatest';
    moveSpan.textContent = moves[i].san;
    pgnEl.appendChild(moveSpan);
    // Keep only the most recent ~30 tokens so the DOM stays small;
    // CSS mask handles the left-edge fade.
    while (pgnEl.childNodes.length > 30) {
        pgnEl.removeChild(pgnEl.firstChild);
    }

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
    clearSequencerHighlights();
    buildSequencerUI();
    is_replay = false;
    is_finale = false;
    disconnectSynths();
    stopAllInstruments();
    moves = [];
    last_move = {};
    current_move = 0;
    cur_file = 0;
    gameState.note_duration_ms = gameState.base_tempo_ms;
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
function sanitizePgn(text) {
    return text
        // Normalize unicode dashes in result tokens (1–0, ½–½) to ASCII
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        // Replace digit-zero castling (0-0, 0-0-0) with letter-O castling
        .replace(/\b0-0-0\b/g, 'O-O-O')
        .replace(/\b0-0\b/g, 'O-O');
}

function startReplay(pgnText) {
    resumeAudioContext();
    resetState();
    pgnText = sanitizePgn(pgnText);
    let loaded = false;
    try {
        loaded = chess_moves.load_pgn(pgnText) !== false;
    } catch (e) {
        console.error('load_pgn threw:', e);
    }
    moves = loaded ? chess_moves.history({ verbose: true }) : [];
    if (!moves.length) {
        // Retry with explicit newline option in case the PGN uses \r\n or spaces
        try {
            if (chess_moves.load_pgn(pgnText, { newline_char: '\r?\n' })) {
                moves = chess_moves.history({ verbose: true });
            }
        } catch (e) { /* ignore */ }
    }
    if (!moves.length) {
        console.error('Failed to parse PGN:', pgnText);
        alert('Could not parse PGN');
        return false;
    }
    is_replay = true;
    if (board) {
        board.destroy();
    }
    board = createBoard('board1');
    gameState.speedup_ms = Math.floor((gameState.note_duration_ms / 2) / moves.length);
    addTimeout(movePiece, gameState.note_duration_ms * board_size);
    return true;
}

// Make replayGame available globally for onclick handlers
window.replayGame = function(element, player_name) {
    if (startReplay(pgns[player_name].join('\n'))) {
        // Mark the clicked game card as the active one
        document.querySelectorAll('.gameCard.playing')
            .forEach(el => el.classList.remove('playing'));
        if (element && element.classList) {
            element.classList.add('playing');
        }
        // Dismiss first-run hint pulse on first interaction
        const picker = document.querySelector('.gamePicker.hinting');
        if (picker) picker.classList.remove('hinting');
    }
};

async function loadPgnFromUrl(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        startReplay(text);
    } catch (e) {
        alert('Failed to load PGN from URL: ' + e.message);
    }
}

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
function populateInstrumentSelectors() {
    const whiteSel = document.getElementById('whiteInstrument');
    const blackSel = document.getElementById('blackInstrument');
    if (whiteSel && blackSel) {
        whiteSel.innerHTML = '';
        blackSel.innerHTML = '';
        INSTRUMENTS.forEach(inst => {
            [whiteSel, blackSel].forEach(sel => {
                const opt = document.createElement('option');
                opt.value = inst.id;
                opt.textContent = inst.label;
                sel.appendChild(opt);
            });
        });
        whiteSel.value = gameState.instrument_names['w'];
        blackSel.value = gameState.instrument_names['b'];
        whiteSel.onchange = () => setInstrument('w', whiteSel.value);
        blackSel.onchange = () => setInstrument('b', blackSel.value);
    }

    // Octave selects: absolute octave numbers, like scientific pitch notation
    // (E3 is roughly mid-register for the right hand, E2 is bass range).
    const whiteOct = document.getElementById('whiteOctave');
    const blackOct = document.getElementById('blackOctave');
    const populateOct = (sel, color) => {
        if (!sel) return;
        sel.innerHTML = '';
        for (let o = 1; o <= 6; o++) {
            const opt = document.createElement('option');
            opt.value = String(o);
            opt.textContent = 'E' + o;
            sel.appendChild(opt);
        }
        sel.value = String(gameState.octave[color]);
        sel.onchange = () => {
            gameState.octave[color] = parseInt(sel.value, 10);
            setupNotes();
        };
    };
    populateOct(whiteOct, 'w');
    populateOct(blackOct, 'b');
}

function normalizePgnUrl(url) {
    // Rewrite lichess game-page URLs to the raw export endpoint so CORS works.
    // e.g. https://lichess.org/abcd1234 -> https://lichess.org/game/export/abcd1234
    const m = url.match(/^https?:\/\/lichess\.org\/([a-zA-Z0-9]{8})(?:[/?#].*)?$/);
    if (m) return 'https://lichess.org/game/export/' + m[1];
    return url;
}

function wirePgnForm() {
    const form = document.getElementById('pgnForm');
    const input = document.getElementById('pgnUrl');
    if (form && input) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const url = input.value.trim();
            if (url) loadPgnFromUrl(normalizePgnUrl(url));
        });
    }
    const pasteForm = document.getElementById('pgnPasteForm');
    const pasteArea = document.getElementById('pgnPaste');
    if (pasteForm && pasteArea) {
        pasteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = pasteArea.value.trim();
            if (text) startReplay(text);
        });
    }
}

function wireChrome() {
    // Sheet open/close: icon buttons in header toggle <details> panels.
    // Opening one closes the others so only one is visible at a time.
    const sheetIds = ['settingsSheet', 'loadPgnSheet', 'aboutSheet'];
    const buttons = document.querySelectorAll('.iconBtn[data-sheet]');
    const syncButtonState = () => {
        buttons.forEach(btn => {
            const sheet = document.getElementById(btn.dataset.sheet);
            btn.setAttribute('aria-expanded', sheet && sheet.open ? 'true' : 'false');
        });
    };
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.sheet);
            if (!target) return;
            const wasOpen = target.open;
            sheetIds.forEach(id => {
                const s = document.getElementById(id);
                if (s) s.open = false;
            });
            target.open = !wasOpen;
            syncButtonState();
        });
    });
    // Also hide the <summary> clickable row since we drive via icons.
    document.querySelectorAll('.sheetSummary').forEach(s => {
        s.addEventListener('click', (e) => e.preventDefault());
    });

    // Tempo slider
    const tempoSlider = document.getElementById('tempoSlider');
    const tempoValue = document.getElementById('tempoValue');
    if (tempoSlider && tempoValue) {
        const update = () => {
            const v = parseInt(tempoSlider.value, 10);
            gameState.base_tempo_ms = v;
            // Only rewrite live tempo if not in the middle of a replay
            if (!is_replay) gameState.note_duration_ms = v;
            tempoValue.textContent = v + ' ms';
        };
        tempoSlider.addEventListener('input', update);
        update();
    }

    // Two-player toggle
    const twoPlayerToggle = document.getElementById('twoPlayerToggle');
    if (twoPlayerToggle) {
        twoPlayerToggle.addEventListener('change', () => {
            if (twoPlayerToggle.checked) {
                window.twoPlayer();
            } else {
                resetState();
            }
        });
    }

    // First-run hint pulse on the game picker until the user clicks something
    const picker = document.querySelector('.gamePicker');
    if (picker) picker.classList.add('hinting');
}

function checkPgnQueryParam() {
    const params = new URLSearchParams(window.location.search);
    const pgnUrl = params.get('pgn');
    if (pgnUrl) {
        const input = document.getElementById('pgnUrl');
        if (input) input.value = pgnUrl;
        loadPgnFromUrl(pgnUrl);
    }
}

function init() {
    resetState();
    populateInstrumentSelectors();
    setupNotes();
    loadDefaultInstruments().then(() => {
        checkPgnQueryParam();
    });
    wirePgnForm();
    wireChrome();

    // Add touch/click event listener to resume audio context
    document.body.addEventListener('touchstart', resumeAudioContext, { once: true });
    document.body.addEventListener('click', resumeAudioContext, { once: true });
}

// Initialize when DOM is ready and Tonal.js is loaded
function initWhenReady() {
    if (window.Tonal) {
        // Tonal.js already loaded
        init();
    } else {
        // Wait for Tonal.js to load (it dispatches 'musicLibraryLoaded' event)
        // Add a timeout fallback in case the script fails to load
        const LOAD_TIMEOUT_MS = 10000;
        let initialized = false;
        
        const handleLoad = () => {
            if (!initialized) {
                initialized = true;
                init();
            }
        };
        
        window.addEventListener('musicLibraryLoaded', handleLoad, { once: true });
        
        setTimeout(() => {
            if (!initialized) {
                initialized = true;
                if (!window.Tonal) {
                    console.error('Tonal.js library failed to load. Audio will use fallback frequencies.');
                }
                init();
            }
        }, LOAD_TIMEOUT_MS);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
} else {
    initWhenReady();
}
