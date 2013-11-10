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
    
    pieceEffects['P'] = new PieceEffect(0.5, 0);
    pieceEffects['B'] = new PieceEffect(0.6, 0);
    pieceEffects['N'] = new PieceEffect(0.6, 0);
    pieceEffects['R'] = new PieceEffect(0.7, 1);
    pieceEffects['Q'] = new PieceEffect(0.8, 2);
    pieceEffects['K'] = new PieceEffect(0.9, 3);

    
    color_and_rank_to_frequency['w'] = {}
    color_and_rank_to_frequency['b'] = {}
    // E minor pentatonic
    color_and_rank_to_frequency['w'][0] = Note.fromLatin('E3').frequency();
    color_and_rank_to_frequency['b'][7] = Note.fromLatin('E1').frequency();

    color_and_rank_to_frequency['w'][1] = Note.fromLatin('A4').frequency();
    color_and_rank_to_frequency['b'][6] = Note.fromLatin('A2').frequency();

    color_and_rank_to_frequency['w'][2] = Note.fromLatin('B4').frequency();
    color_and_rank_to_frequency['b'][5] = Note.fromLatin('B2').frequency();

    color_and_rank_to_frequency['w'][3] = Note.fromLatin('B4').frequency();
    color_and_rank_to_frequency['b'][4] = Note.fromLatin('B2').frequency();

    color_and_rank_to_frequency['w'][4] = Note.fromLatin('D4').frequency();
    color_and_rank_to_frequency['b'][3] = Note.fromLatin('D2').frequency();

    color_and_rank_to_frequency['w'][5] = Note.fromLatin('E4').frequency();
    color_and_rank_to_frequency['b'][2] = Note.fromLatin('E2').frequency();

    color_and_rank_to_frequency['w'][6] = Note.fromLatin('G4').frequency();
    color_and_rank_to_frequency['b'][1] = Note.fromLatin('G2').frequency();

    color_and_rank_to_frequency['w'][7] = Note.fromLatin('A5').frequency();
    color_and_rank_to_frequency['b'][0] = Note.fromLatin('A3').frequency();

    for(var i = 0; i < files.length; i++) {
        unplayableSquares[files[i] + '1'] = 1;
        unplayableSquares[files[i] + '2'] = 1;
        unplayableSquares[files[i] + '7'] = 1;
        unplayableSquares[files[i] + '8'] = 1;
/*
        if (i == 7) {
            color_and_rank_to_frequency['w'][i] = Note.fromLatin('A5').frequency();
            color_and_rank_to_frequency['b'][i] = Note.fromLatin('A3').frequency();
        } else {
            color_and_rank_to_frequency['w'][i] = Note.fromLatin(files[i].toUpperCase() + '4').frequency();
            color_and_rank_to_frequency['b'][i] = Note.fromLatin(files[i].toUpperCase() + '2').frequency();
        } */
    }
}
function playPosition(cur_move) {
    // it's really a synth per rank.
    for (var i = 0; i < files.length; i++) {
        var sub_volume = context.createGainNode();
        sub_volume.gain.value = 0.5;
        sub_volume.connect(volume);
        synths[i] = context.createOscillator();
        synths[i].connect(sub_volume);
        synths[i].sub_volume = sub_volume;
    }
    special_event_synth = context.createOscillator();
    wave = context.createPeriodicWave(new Float32Array([0,440.0, 880.0]), new Float32Array([0, 220.0, 330.0]));
    special_event_synth.setPeriodicWave(wave);
    special_event_synth.connect(volume);
    playRankInFile(cur_move);
}

function playRankInFile(cur_move) {
    var cur_position = board.position();
    $('#status').text('file: ' + cur_file);
    for (var i = 1; i < 9; i++) {
        var cur_square = files[cur_file] + '' + i;
        if(cur_position[cur_square]) {
            var color = cur_position[cur_square].substring(0,1);
            var piece = cur_position[cur_square].substring(1,2);
            if (unplayableSquares[cur_square] != 1) { 
                var is_capture = false;
                if(cur_move.captured && cur_move.to == cur_square) {
                    special_event_synth.noteOn(0);
                    is_capture = true;
                    console.log("captured!");
                }
                flashSquare(cur_square, is_capture);
                synths[i - 1].type = pieceEffects[piece].synth;
                synths[i - 1].sub_volume.gain.value = pieceEffects[piece].gain;
                synths[i - 1].frequency.value = color_and_rank_to_frequency[color][i-1];
                synths[i - 1].noteOn(0);
            }
        }
    }
    cur_file = cur_file + 1;
    if (cur_file < files.length) {
        setTimeout(function(){playRankInFile(cur_move);}, 200);
    } else {
        cur_file = 0;
        stopNotes();
    }
}

function stopNotes() {
    for(var j = 0; j < files.length; j++) {
        synths[j].noteOff(0);
        synths[j].disconnect();
    }
    special_event_synth.disconnect();
    movePiece();

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
