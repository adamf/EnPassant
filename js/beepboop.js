var files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
var unplayableSquares = {}
var context;
var synths = [];
var color_and_rank_to_frequency = {}
var volume;
var pieceEffects = {}
var special_event_synth;

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
    addTimeout(function(){ enote.disconnect(); gnote.disconnect(); bnote.disconnect(); }, note_duration_ms);

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
                    //playChordOsc();
                    is_capture = true;
                }
                if (typeof(synths[i - 1]) != 'undefined') {
                    synths[i - 1].disconnect();
                }
                var sub_volume = context.createGainNode();
                sub_volume.gain.value = 0.5;
                sub_volume.connect(volume);
                synths[i - 1] = context.createOscillator();
                synths[i - 1].connect(sub_volume);
                synths[i - 1].type = pieceEffects[piece].synth;
                sub_volume.gain.value = pieceEffects[piece].gain;
                synths[i - 1].frequency.value = color_and_rank_to_frequency[color][i-1];
                flashSquare(cur_square, is_capture);
                synths[i - 1].start(0);
                // if the synth is already playing, we need to stop and re-trigger the note.
            }
        }
    }
    cur_file = cur_file + 1;
    if (cur_file < files.length) {
        addTimeout(function(){playRankInFile(cur_move);}, note_duration_ms);
    } else {
        cur_file = 0;
        addTimeout(function(){ stopNotes(cur_move); }, note_duration_ms);
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
            synths[j].disconnect();
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
