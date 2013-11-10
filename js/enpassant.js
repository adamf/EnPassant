var board;
var chess_moves = new Chess();
var current_move = 0;
var cur_file = 0;
var moves = [];
var last_move;
var is_replay = false;
var timeouts = [];
var note_duration_ms = 200;
var speedup_ms = 0;
var board_size = 8;

function centerMainDiv() {
    $('.main').css({
        position:'absolute',
        left: ($(window).width() - $('.main').outerWidth())/2,
        top: ($(window).height() - $('.main').outerHeight())/2
    });
    $('.mainBoard').css({
        position:'absolute',
        left: ($('.main').width() - $('.mainBoard').outerWidth())/2,
    });

    var docHeight = $('.main').height();
    var footerHeight = $('#footer').height();
    var footerTop = $('#footer').position().top + footerHeight;

    if (footerTop < docHeight) {
        $('#footer').css('margin-top', 10 + (docHeight - footerTop) + 'px');
    }
}

function init() {
    centerMainDiv();
    $(window).resize(centerMainDiv);
    resetState();
}

function clearTimeouts() {
    for (var i = 0; i < timeouts.length; i++) {
        clearTimeout(timeouts[i]);
    }
    timeouts = [];
    
}
function addTimeout(func, timeout) {
    timeouts.push(setTimeout(func, timeout));
}

function replayGame(element, player_name) {
    resetState();
    $(element).addClass("playerImageColor");
    chess_moves.load_pgn(pgns[player_name].join('\n'));
    moves = chess_moves.history({verbose: true});
    is_replay = true;
    board = new ChessBoard('board1', { position: 'start', showNotation: false });
    speedup_ms = Math.floor((note_duration_ms / 2) / moves.length)
    addTimeout(movePiece, note_duration_ms * board_size);
}

function twoPlayer() {
    resetState();
    board = new ChessBoard('board1', cfg);
    updateStatus();
}

function resetState() {
    board = new ChessBoard('board1', cfg);
    $('img').each(function( index ) {
        $(this).removeClass("playerImageColor");
        });
    clearTimeouts();
    is_replay = false;
    disconnectSynths();
    moves = [];
    last_move = {};
    current_move = 0;
    cur_file = 0;
    note_duration_ms = 200;
    chess_moves = new Chess();
    setupMusic();
}


function movePiece() {
    i = current_move;
    if(i >= moves.length) {
        return;
    }
    if (current_move - 1 > 0) {
        last_move = moves[current_move - 1];
    } else {
        last_move = moves[current_move];
    }
    board.move(moves[i].from +'-'+ moves[i].to);
    var rank = moves[i].from.substring(1,2);
    if (moves[i].san == "O-O") {
        if (rank == 1) {
            board.move('h1-f1');
        } else {
            board.move('h8-f8');
        }
    } else if (moves[i].san == "O-O-O") {
        if (rank == 1) {
            board.move('a1-d1');
        } else {
            board.move('a8-d8');
        }
    }
    if (unplayableSquares[moves[i].from] == 1) {
        delete unplayableSquares[moves[i].from];
    }
    playPosition(moves[i]);
    note_duration_ms = note_duration_ms - speedup_ms;
    var text = $('#pgn').text();
    if (current_move % 2 == 0) {
        display_move = current_move / 2;
        display_move = display_move + 1;
        text = text + ' ' + display_move + '. ';
    }
    $('#pgn').text(text + ' ' + moves[i].san);
    
    current_move = current_move + 1;
}