/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

/** Bookmarks Extension */

// TODO: Persistent bookmarks (restore bookmarks when the file is opened again)
// TODO: Export API to let others set/remove/query bookmarks

define(function (require, exports, module) {
    'use strict';

	var CommandManager    = brackets.getModule("command/CommandManager"),
        Menus             = brackets.getModule("command/Menus"),
		KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
        DocumentManager   = brackets.getModule("document/DocumentManager"),
        EditorManager     = brackets.getModule("editor/EditorManager");
    
    var _documentBookmarks = {};
    var _activeDocument = null;
    var _activeBookmarks = [];
    var _activeEditor = null;
    
    function toggleBookmark() {
        function addBookmark(editor, pos) {
            var _codeMirror = editor._codeMirror;
            var bookmark = _codeMirror.setBookmark({line: pos.line, ch: 0 }); // Only one bookmark per line
            
            _activeBookmarks.push({ originalLineNum: pos.line, ch: 0, bookmark: bookmark });
            _activeBookmarks.sort(function (a, b) {
                return a.originalLineNum - b.originalLineNum;
            });
    
            var marker = _codeMirror.setMarker(pos.line, null, "ts-bookmarks-bookmark"); // This marker is automatically tracked/updated by CodeMirror, when lines are added to/removed from the document.
        }
        
        function removeBookmark(editor, pos) {
            var linenum = pos.line;
            var _codeMirror = editor._codeMirror;
            var i = 0;

            for (i = 0; i < _activeBookmarks.length; i++) {
                var bookmark = _activeBookmarks[i].bookmark;
                var bmLinenum = bookmark.find().line;
                if (bmLinenum === linenum) {
                    bookmark.clear();
                    _codeMirror.clearMarker(pos.line);
                    _activeBookmarks.splice(i, 1);
                    break;
                }
            }
        }
        
        var editor = EditorManager.getCurrentFullEditor();
        var _codeMirror = editor._codeMirror;
        var pos    = _codeMirror.getCursor();
        var line   = pos.line;

        var lineInfo = _codeMirror.lineInfo(line);
        var markerClass = lineInfo.markerClass;
        if (markerClass && markerClass.indexOf("ts-bookmarks-bookmark") > -1) {
            removeBookmark(editor, pos);
        } else {
            addBookmark(editor, pos);
        }
    }

    function nextBookmark() {
        if (_activeBookmarks.length === 0) {
            return;
        }
        
        var _codeMirror = _activeEditor._codeMirror;
        var currentLinenum = _codeMirror.getCursor().line;
        var i = 0;

        var found = false;
        for (i = 0; i < _activeBookmarks.length; i++) {
            var bookmark = _activeBookmarks[i].bookmark;
            var pos = bookmark.find();
            if (pos) {
                var linenum = pos.line;
                if (linenum > currentLinenum) {
                    _codeMirror.setCursor({ line: linenum, ch: 0 });
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            var firstBookmarkPos = _activeBookmarks[0].bookmark.find();
            if (firstBookmarkPos) {
                _codeMirror.setCursor({ line: firstBookmarkPos.line, ch: 0 });
            }
        }
    }

    function previousBookmark() {
        if (_activeBookmarks.length === 0) {
            return;
        }
        
        var _codeMirror = _activeEditor._codeMirror;
        var currentLinenum = _codeMirror.getCursor().line;
        var i = 0;

        var found = false;
        for (i = _activeBookmarks.length - 1; i >= 0; i--) {
            var bookmark = _activeBookmarks[i].bookmark;
            var pos = bookmark.find();
            if (pos) {
                var linenum = pos.line;
                if (linenum < currentLinenum) {
                    _codeMirror.setCursor({ line: linenum, ch: 0 });
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            var lastBookmarkPos = _activeBookmarks[_activeBookmarks.length - 1].bookmark.find();
            if (lastBookmarkPos) {
                _codeMirror.setCursor({ line: lastBookmarkPos.line, ch: 0 });
            }
        }
    }

    function clearBookmarks() {
        var _codeMirror = _activeEditor._codeMirror;
        var i = 0;
        
        for (i = 0; i < _activeBookmarks.length; i++) {
            var bookmark = _activeBookmarks[i].bookmark;
            var pos = bookmark.find();
            if (pos) {
                _codeMirror.clearMarker(pos.line);
            }
            bookmark.clear();
        }
        _activeBookmarks.length = 0;
    }
            
    function currentDocumentChanged() {
        _activeEditor = EditorManager.getCurrentFullEditor();
        _activeDocument = DocumentManager.getCurrentDocument();
        _activeBookmarks = _documentBookmarks[_activeDocument.url] || [];
        _documentBookmarks[_activeDocument.url] = _activeBookmarks;
    }

    function addStyles() {
        var cssText = ".ts-bookmarks-bookmark { background-color: #80C7F7 !important; color: #000 !important; border-radius: 2px !important; }";
        $("<style>").text(cssText).appendTo(window.document.head);
    }
    
    function addMenuCommands() {
        var navigateMenu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
        navigateMenu.addMenuDivider();
        
        function registerCommandHandler(commandId, menuName, handler, shortcut) {
            CommandManager.register(menuName, commandId, handler);
            navigateMenu.addMenuItem(commandId);
            KeyBindingManager.addBinding(commandId, shortcut);
        }
        
        registerCommandHandler("ts.bookmarks.toggleBookmark",   "Toggle Bookmark",   toggleBookmark,   "Ctrl-F4");
        registerCommandHandler("ts.bookmarks.nextBookmark",     "Next Bookmark",     nextBookmark,     "F4");
        registerCommandHandler("ts.bookmarks.previousBookmark", "Previous Bookmark", previousBookmark, "Shift-F4");
        registerCommandHandler("ts.bookmarks.clearBookmarks",   "Clear Bookmarks",   clearBookmarks,   "Ctrl-Shift-F4");
    }

    function addHandlers() {
        $(DocumentManager).on("currentDocumentChange", currentDocumentChanged);
    }

    function load() {
        addStyles();
        addMenuCommands();
        addHandlers();

        currentDocumentChanged(); // Load up the currently open document
    }
    
    load();
});