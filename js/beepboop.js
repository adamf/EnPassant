var files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
var unplayableSquares = {}
var context;
var synths = [];
var color_and_rank_to_frequency = {}
var volume;
var pieceEffects = {}
var special_event_synth;

var chessMusic = {};

var samples = {}

function PieceEffect(gain, synth) {
    this.gain = gain;
    this.synth = synth;  
    /*  web audio API's synth types:
    enum OscillatorType {
        "sine",
        "square",
        "sawtooth",
        "triangle",
        "custom"
    }; */
}


// make black and white different octaves
function setupMusic() 
{
    context = new webkitAudioContext();
    volume = context.createGainNode();
    volume.gain.value = 0.5;
    volume.connect(context.destination);
    
    pieceEffects['P'] = new PieceEffect(0.3, 0);
    pieceEffects['B'] = new PieceEffect(0.4, 0);
    pieceEffects['N'] = new PieceEffect(0.4, 0);
    pieceEffects['R'] = new PieceEffect(0.5, 0);
    pieceEffects['Q'] = new PieceEffect(0.5, 0);
    pieceEffects['K'] = new PieceEffect(0.6, 0);

    
    color_and_rank_to_frequency['w'] = {}
    color_and_rank_to_frequency['b'] = {}
    // E minor pentatonic
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

    for(var i = 0; i < files.length; i++) {
        unplayableSquares[files[i] + '1'] = 1;
        unplayableSquares[files[i] + '2'] = 1;
        unplayableSquares[files[i] + '7'] = 1;
        unplayableSquares[files[i] + '8'] = 1;
    }
}

function playChordOsc() {
    var enote = context.createOscillator();
    enote.frequency.value = Note.fromLatin('E2').frequency();
    enote.connect(volume);
    var gnote = context.createOscillator();
    gnote.frequency.value = Note.fromLatin('G2').frequency();
    gnote.connect(volume);
    var bnote = context.createOscillator();
    bnote.frequency.value = Note.fromLatin('B2').frequency();
    bnote.connect(volume);
    enote.noteOn(0);
    bnote.noteOn(0);
    gnote.noteOn(0);
    addTimeout(function(){ enote.disconnect(); gnote.disconnect(); bnote.disconnect(); }, gameState.note_duration_ms);

}
function playPosition(cur_move) {
    playRankInFile(cur_move);
}

function isCurrentMoveLastMove(cur_move) {
    cur_from = cur_move.from;
    cur_to = cur_move.to;
    last_from = last_move.from;
    last_to = last_move.to;
    if(last_to == cur_to && last_from == cur_from) {
        return true;
    }
    return false;
}

function playRankInFile(cur_move) {
    var cur_position = board.position();
    //$('#status').text('file: ' + cur_file);
    for (var i = 1; i < 9; i++) {
        var cur_square = files[cur_file] + '' + i;
        if(cur_position[cur_square]) {
            var color = cur_position[cur_square].substring(0,1);
            var piece = cur_position[cur_square].substring(1,2);
            if (unplayableSquares[cur_move.from]) {
                delete unplayableSquares[cur_move.from];
            }
            if (unplayableSquares[cur_square] != 1) { 
                var is_capture = false;
                if (cur_move.captured && cur_move.to == cur_square && !isCurrentMoveLastMove(cur_move)) {
                    is_capture = true;
                }
                if (typeof(synths[i - 1]) != 'undefined') {
                    stopNote(i - 1);
                }
                playSquare(cur_square, color, piece);
                flashSquare(cur_square, is_capture);
            }
        }
    }
    cur_file = cur_file + 1;
    if (cur_file < files.length) {
        addTimeout(function(){playRankInFile(cur_move);}, gameState.note_duration_ms);
    } else {
        cur_file = 0;
        addTimeout(function(){ stopNotes(cur_move); }, gameState.note_duration_ms);
    }
}

function stopNotes(cur_move) {
    disconnectSynths();
    if (is_replay) {
        movePiece();
    } else {
        last_move = cur_move;
        cur_move = moves[moves.length - 1]
        playPosition(cur_move);
    }

}

function disconnectSynths() {
    for(var j = 0; j < files.length; j++) {
        if (typeof(synths[j]) != 'undefined') {
            stopNote(j);
        }
    }
    if (typeof(special_event_synth) != 'undefined') {
        special_event_synth.disconnect();
    }
}

function flashSquare(square, is_capture) {
    var original_background = $('.square-' + square).css('backgroundColor');
    var flash_color = '#ffffff';
    if (is_capture == true) {
        flash_color = '#ff0000';
    }
    $('.square-' + square).animate({ backgroundColor: flash_color }, 10, 
            function() {
                $('.square-' + square).animate({ backgroundColor: original_background }, 200, function() {});
            });
}

function loadSample(sampleDir, sample) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'samples/' + sampleDir + '/' + sample.file, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () { var buffer = xhr.response; if (buffer) { decodeSample(buffer, sampleDir, sample); }};
    xhr.onerror = function () { alert('failed to load sample ' + sampleDir + '/' + sample.file); };
    xhr.send();
}

function decodeSample(sampleData, sampleDir, sample) {
    context.decodeAudioData(
            sampleData, 
            function onSuccess (decodedData) { storeSampleBuffer(decodedData, sampleDir, sample); }, 
            function onError (error) { alert('Error decoding ' + sampleDir + '/' + sample.file); }
        );
}

function storeSampleBuffer(buffer, sampleDir, sample) {
    if (!buffer) {
        alert('Error decoding ' + sampleDir + '/' + sample.file);
        return;
    }
    samples[sampleDir]['notes'][sample.note] = buffer;
    samples[sampleDir]['to_load'].pop();
    if (samples[sampleDir]['to_load'].length == 0) {
        console.log('All samples loaded and decoded');
        delete samples[sampleDir]['to_load']
        gameState.samples_loaded = true;
    }
}

function setupNotes() {

    switch (gameState.music_type) {
        case 'samples':
            $.each(sampleConfigs, function(key, val) {
                if (val.dir == gameState.sample_name) {
                    chessMusic.rootNote = val.rootNote;
                    chessMusic.rootOctave = val.rootOctave;
                }
            });
            break;
        case 'oscillator':
        default:
            chessMusic.rootNote = 'A'  
            chessMusic.rootOctave = 2;
            break;
    } 
    chessMusic.lowNotes = Note.fromLatin(chessMusic.rootNote + chessMusic.rootOctave).scale('minor pentatonic');
    chessMusic.midNotes = Note.fromLatin(chessMusic.rootNote + (chessMusic.rootOctave + 1)).scale('minor pentatonic');
    chessMusic.highNotes = Note.fromLatin(chessMusic.rootNote + (chessMusic.rootOctave + 2)).scale('minor pentatonic');
}
function loadSamplesConfig() {
    $.getJSON('samples/samples.json', function(data) {
        sampleConfigs = data;
        $.each(data, function(key, val) {
            console.log(val.dir);
            var sampleDir = val.dir;
            samples[sampleDir] = {};
            samples[sampleDir]['notes'] = {};
            samples[sampleDir]['config_index'] = key;
            samples[sampleDir]['to_load'] = [] 
            $.each(val.samples, function(key, sample) {
                samples[sampleDir]['to_load'].push(sample.file);
                loadSample(sampleDir, sample)
            });
        });
        setupNotes();
    });

    
}

function getNoteForRankAndColor(rank, color) {
    if (color == 'w') {
        if (rank < chessMusic.midNotes.length) {
            return chessMusic.midNotes[rank];
        }
        return chessMusic.highNotes[rank - chessMusic.midNotes.length];
    }
    if (color == 'b') {
        if (rank < chessMusic.lowNotes.length) {
            return chessMusic.lowNotes[rank];
        }
        return chessMusic.midNotes[rank - chessMusic.lowNotes.length];
    }
}


function playSquare(square, color, piece) {
    var rank = square.substring(1,2) - 1;
    var note = getNoteForRankAndColor(rank, color);
    switch (gameState.music_type) {
        case "samples":
            playSample(rank, note, piece);
            break;
        case "oscillator":
        default:
            playOscillator(rank, note, piece);
            break;
    }
    
}

function playOscillator(rank, note, piece) {
    var freq = note.frequency();
    var sub_volume = context.createGainNode();
    sub_volume.gain.value = 0.5;
    sub_volume.connect(volume);
    sub_volume.gain.value = pieceEffects[piece].gain;
    synths[rank] = context.createOscillator();
    synths[rank].connect(sub_volume);
    synths[rank].type = pieceEffects[piece].synth;
    synths[rank].frequency.value = freq; 
    synths[rank].sub_volume = sub_volume;
    synths[rank].start(0);
}

function stopNote(rank) {
    synths[rank].sub_volume.gain.value = 0.0;
}

function playSample(rank, note, piece) {
    var sub_volume = context.createGainNode();
    sub_volume.gain.value = 0.5;
    sub_volume.connect(volume);
    sub_volume.gain.value = pieceEffects[piece].gain;
    var latinNote = note.latin() + '' + note.octave();
    synths[rank] = context.createBufferSource();
    synths[rank].sub_volume = sub_volume;
    synths[rank].buffer = samples[gameState.sample_name]['notes'][latinNote];
    synths[rank].connect(sub_volume);
    synths[rank].start(0);
}
