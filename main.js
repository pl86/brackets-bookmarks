/*
 * The MIT License (MIT)
 * Copyright (c) 2014 George Raptis. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
*/

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, Mustache, brackets, window */

define(function (require, exports, module) {
    'use strict';

    var CommandManager = brackets.getModule('command/CommandManager'),
        Menus = brackets.getModule('command/Menus'),
        KeyBindingManager = brackets.getModule('command/KeyBindingManager'),
        DocumentManager = brackets.getModule('document/DocumentManager'),
        EditorManager = brackets.getModule('editor/EditorManager'),
        ExtensionUtils = brackets.getModule('utils/ExtensionUtils'),
        PanelManager = brackets.getModule('view/PanelManager'),
        WorkspaceManager = brackets.getModule('view/WorkspaceManager'),
        AppInit = brackets.getModule('utils/AppInit'),
        $bmlIcon = $('<a title="Bookmarks" id="georapbox-bookmarks-icon"></a>'),
        bookmarksPanelTemplate = require('text!html/bookmarks-panel.html'),
        bookmarksRowTemplate = require('text!html/bookmarks-row.html'),
        panel,
        $bookmarksPanel,
        COMMAND_ID = 'georapbox_execute',
        GUTTER_NAME = 'brackets-bookmaks-gutter',
        _activeEditor = null,
        _activeDocumentFileName = '',
        _activeDocumentFilePath = '',
        _activeBookmarks = [],
        _firstDocumentLoaded = false;

    /**
     * Description: Replace an object's value with undefined if meets condition.
     *              It is used when saving an object to localStorage to avoid circular reference.
     * @param {String} key
     * @param {Object} value
     * @returns {Object} undefined || value    
    */
    var replacer = function (key, value) {
        if (key === 'bookmark') {
            return undefined;
        } else {
            return value;
        }
    };

    /**
     * Description: Extends Storage to save objects.
    */
    Storage.prototype.setObj = function (key, obj) {
        return this.setItem(key, JSON.stringify(obj, replacer));
    };

    /**
     * Description: Extends Storage to retrieve objects.
    */
    Storage.prototype.getObj = function (key) {
        return JSON.parse(this.getItem(key));
    };

    /**
     * Description: Saves bookmars to localStorage.
    */
    function saveBookmarksToStorage() {
        var storageBookmarks = _activeBookmarks.map(function(b) {
            return {
                lineNum: b.lineNum,
                text: b.text,
                fileName: b.fileName,
                filePath: b.filePath,
                label: b.label
            }
        });
        localStorage.removeItem('georapbox.bookmarks');
        localStorage.setObj('georapbox.bookmarks', storageBookmarks);
    }

    function renderBookmarksGutter() {
        var i = 0,
            total = _activeBookmarks.length,
            editor = EditorManager.getCurrentFullEditor(),
            cm = null;
        if (!editor) {
            return false;
        }
        cm = editor._codeMirror;
        for (i = 0; i < total; i++) {
            if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                _activeBookmarks[i].gutterRef = cm.setGutterMarker(_activeBookmarks[i].lineNum, GUTTER_NAME, makeMarker());
            }
        }
    }

    /**
     * Description: Loads bookmarks from localStorage
     */
    function loadBookmarksFromStorage() {
        var storedBookmarks = localStorage.getObj('georapbox.bookmarks') || [],
            editor = EditorManager.getCurrentFullEditor(),
            cm = editor._codeMirror,
            i = 0,
            len = storedBookmarks.length,
            bookmark = null;
        _activeBookmarks = [];
        for (i; i < len; i++) {
            bookmark = {
                lineNum: storedBookmarks[i].lineNum,
                text: storedBookmarks[i].text,
                fileName: storedBookmarks[i].fileName,
                filePath: storedBookmarks[i].filePath,
                label: storedBookmarks[i].label
            }
            _activeBookmarks.push(bookmark);
        }
    }

    /**
     * Description: Toggles visibility of bookmarks
     *              between 'View all' and 'view by current file'
    */
    function toggleBookmarksVisibility() {
        var checkbox = $('#georapbox-view-all input'),
            inactiveLines = $bookmarksPanel.find('tr.inactive');

        if (checkbox.is(':checked')) {
            inactiveLines.addClass('view-all');
        } else {
            inactiveLines.removeClass('view-all');
        }
    }

    /**
     * Description: Renders active bookmarks on bottom panel.
    */
    function renderBookmarksPanel() {
        if (!panel.isVisible()) return false;

        var bookmarksTable = $bookmarksPanel.find('table tbody'),
            bookmarksRowsLen = 0,
            lineColumn,
            fileColumn,
            lineNum,
            file;

        var resultsHTML = Mustache.render(bookmarksRowTemplate, {
            bookmarks: _activeBookmarks
        });

        bookmarksTable.empty().append(resultsHTML);

        $.each(bookmarksTable.find('tr'), function () {
            bookmarksRowsLen += 1;

            lineColumn = $(this).find('td.line');
            fileColumn = $(this).find('td.file');

            lineNum = parseInt(lineColumn.text(), 10) + 1;
            lineColumn.html(lineNum);

            if (fileColumn.attr('title') !== _activeDocumentFilePath) {
                $(this).addClass('inactive');
            } else {
                $(this).removeClass('inactive');
            }
        });

        toggleBookmarksVisibility();
        return false;
    }

    function addBookmarkByLineIndex(cm, lineIndex) {
        var gutterRef = cm.setGutterMarker(lineIndex, GUTTER_NAME, makeMarker()),
            info = cm.lineInfo(gutterRef);
        if (!info) return false;

        _activeBookmarks.push({
            lineNum: lineIndex,
            text: info.text,
            gutterRef: gutterRef,
            fileName: _activeDocumentFileName,
            filePath: _activeDocumentFilePath,
            label: 'BOOKMARK'
        });

        _activeBookmarks.sort(function (a, b) {
            return a.lineNum - b.lineNum;
        });
    }

    function findBookmarkIndexByLineIndex(lineIndex) {
        var i = 0;
        for (i = 0; i < _activeBookmarks.length; i++) {
            if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                if (_activeBookmarks[i].lineNum === lineIndex) {
                    return i;
                }
            }
        }
        return -1;
    }

    function removeBookmarkByLineIndex(cm, lineIndex) {
        var i = 0;
        cm.setGutterMarker(lineIndex, GUTTER_NAME, null);
        i = findBookmarkIndexByLineIndex(lineIndex);
        if (i >= 0) {
            _activeBookmarks.splice(i, 1);
        }
    }

    /**
     * Description: Toggles Bookmark.
     * @param {String} action (optional) Description: If value is 'remove' it removes the current bookmark.
    */
    function toggleBookmark(action) {
        var editor = EditorManager.getCurrentFullEditor(),
            cm = editor._codeMirror,
            pos = cm.getCursor(),
            lineIndex = pos.line,
            hasBookmark = false;
        hasBookmark = hasBookmarkAtLineIndex(cm, lineIndex);
        if (hasBookmark || action === 'remove') {
            removeBookmarkByLineIndex(cm, lineIndex);
        } else {
            addBookmarkByLineIndex(cm, lineIndex);
        }

        saveBookmarksToStorage();
        renderBookmarksPanel();
    }

    /**
     * Description: Jumps to bookmark line.
     * @param {Object} _codeMirror
     * @param {Number} linenum
    */
    function jumpToLine(_activeEditor, linenum) {
        _activeEditor.setCursorPos({ line: linenum, ch: 0 });
		_activeEditor.centerOnCursor();
    }

    /**
     * Description: Navigates to next active bookmark.
    */
    function nextBookmark() {
        if (_activeBookmarks.length === 0) {
            return;
        }

        var _codeMirror = _activeEditor._codeMirror,
            currentLinenum = _codeMirror.getCursor().line,
            i = 0,
            len = _activeBookmarks.length,
            found = false,
            firstBookmarkPos,
            linenum;

        for (i = 0; i < len; i++) {
            if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                linenum = _activeBookmarks[i].lineNum;

                if (linenum > currentLinenum) {
                    jumpToLine(_activeEditor, linenum);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            for (i = 0; i < len; i++) {
                if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                    firstBookmarkPos = _activeBookmarks[i].bookmark.find();
                    break;
                }
            }

            if (firstBookmarkPos) {
                jumpToLine(_activeEditor, firstBookmarkPos.line);
            }
        }
    }

    /**
     * Description: Navigates to previous active bookmark.
    */
    function previousBookmark() {
        if (_activeBookmarks.length === 0) {
            return;
        }

        var _codeMirror = _activeEditor._codeMirror,
            currentLinenum = _codeMirror.getCursor().line,
            i = 0,
            len = _activeBookmarks.length,
            found = false,
            lastBookmarkPos,
            linenum;

        for (i = len - 1; i >= 0; i--) {
            if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                linenum = _activeBookmarks[i].lineNum;

                if (linenum < currentLinenum) {
                    jumpToLine(_activeEditor, linenum);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            for (i = len - 1; i >= 0; i--) {
                if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                    lastBookmarkPos = _activeBookmarks[i].bookmark.find();
                    break;
                }
            }

            if (lastBookmarkPos) {
                jumpToLine(_activeEditor, lastBookmarkPos.line);
            }
        }
    }

    /**
     * Description: Clears all active bookmarks.    
    */
    function clearBookmarks() {
        var _codeMirror = _activeEditor._codeMirror,
            i = 0,
            bookMarksLength = _activeBookmarks.length,
            tempArr = [];

        for (i; i < bookMarksLength; i++) {
            if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                var bookmark = _activeBookmarks[i].bookmark,
                    pos = bookmark.find();

                if (pos) {
                    _codeMirror.removeLineClass(pos.line, null, 'georapbox-bookmarks-bookmark');
                }
                bookmark.clear();
                tempArr.push(i);
            }
        }

        _activeBookmarks = $.grep(_activeBookmarks, function (n, i) {
            return $.inArray(i, tempArr) === -1;
        });

        saveBookmarksToStorage();
        renderBookmarksPanel();
    }

    /**
     * Description: Saves bookmark label.
     * @param {Object} event
     * @returns {Boolean} false
    */
    function saveBookmarkLabel(event) {
        var $this = $(event.target),
            index = -1,
            lineNum = parseInt($this.parent().parent().prev().text(), 10) - 1,
            filePath = $this.parent().parent().parent().find('td.file').attr('title'),
            i = 0,
            len = _activeBookmarks.length;

        for (i; i < len; i++) {
            if (filePath === _activeBookmarks[i].filePath && _activeBookmarks[i].lineNum === lineNum) {
                index = i;
                _activeBookmarks[index].label = $this.val();
                $this.attr('title', $this.val());
                saveBookmarksToStorage();
                return false;
            }
        }
    }

    /**
     * Description: Toggles bookmarks bottom panel state.
    */
    function togglePanel() {
        if (panel.isVisible()) {
            panel.hide();
            $bmlIcon.removeClass('active');
            CommandManager.get('georapbox.bookmarks.viewBookmarks').setChecked(false);
        } else {
            panel.show();
            $bmlIcon.addClass('active');
            CommandManager.get('georapbox.bookmarks.viewBookmarks').setChecked(true);
            renderBookmarksPanel();
        }
    }

    /**
     * Description: Actions that take place when document content changes.
    */
    function currentEditorChanged(cm, change) {
        var lineDiff = change.text.length - change.removed.length,
            bookmarksLineNrChanged = false,
            i = 0,
            len = _activeBookmarks.length,
            editor = EditorManager.getCurrentFullEditor(),
            _codeMirror = null,
            toRemoveBookmarks = [],
            info = null;
        if (!lineDiff || !editor) { return; }
        _codeMirror = editor._codeMirror;
        for (i; i < len; i++) {
            if (_activeBookmarks[i].filePath === _activeDocumentFilePath) {
                info = cm.lineInfo(_activeBookmarks[i].gutterRef);
                if (!info) {
                    toRemoveBookmarks.unshift(i);
                    bookmarksLineNrChanged = true;
                } else if (_activeBookmarks[i].lineNum != info.line
                           || _activeBookmarks[i].text != info.text
                          ) {
                    _activeBookmarks[i].lineNum = info.line;
                    _activeBookmarks[i].text = info.text;
                    bookmarksLineNrChanged = true;
                }
            }
        }
        if (bookmarksLineNrChanged) {
            toRemoveBookmarks.forEach(function (i) {
                _activeBookmarks.splice(i, 1);
            });
            renderBookmarksPanel();
        }
    }

    function makeMarker() {
        var marker = document.createElement("div");
        marker.style.color = "#80C7F7";
        marker.style.marginLeft = '-13px';
        marker.style.width = '12px';
        marker.style.textAlign = 'center';
        marker.innerHTML = "●";
        return marker;
    }

    function hasBookmarkAtLineIndex(cm, lineIndex) {
        var info;
        if (!cm) {
            return;
        }
        info = cm.lineInfo(lineIndex);
        if (info.gutterMarkers && info.gutterMarkers.hasOwnProperty(GUTTER_NAME)) {
            return true;
        }
        return false;
    }

    function gutterClick(cm, lineIndex, gutterId) {
        var hasBookmark = hasBookmarkAtLineIndex(cm, lineIndex);
        if (!cm) {
            return;
        }
        //cm.setGutterMarker(lineIndex, GUTTER_NAME, hasBookmark ? null : makeMarker());
        if (hasBookmark) {
            removeBookmarkByLineIndex(cm, lineIndex);
        } else {
            addBookmarkByLineIndex(cm, lineIndex);
        }

        saveBookmarksToStorage();
        renderBookmarksPanel();
    }

    /**
     * Description: Actions that take place when document changes.
    */
    function currentDocumentChanged() {
        var editor = EditorManager.getCurrentFullEditor(),
            cm = null,
            activeDocument = null;
        if (!editor) { return; }
        if (_activeEditor && activeDocument) {
            _activeEditor._codeMirror.off('change', currentEditorChanged);
        }
        cm = editor._codeMirror;

        var gutters = cm.getOption("gutters").slice(0);
        if (gutters.indexOf(GUTTER_NAME) === -1) {
            gutters.push(GUTTER_NAME);
            cm.setOption("gutters", gutters);
            cm.on("gutterClick", gutterClick);
        }

        cm.on('change', currentEditorChanged);

        _activeEditor = EditorManager.getCurrentFullEditor();
        activeDocument = DocumentManager.getCurrentDocument();
        if (activeDocument) {
            if (!_firstDocumentLoaded) {
                _firstDocumentLoaded = true;
                loadBookmarksFromStorage();
            }
            if (_activeDocumentFilePath != activeDocument.file._path) {
                _activeDocumentFilePath = activeDocument.file._path;
                _activeDocumentFileName = activeDocument.file._name;
                renderBookmarksGutter();
            }
            renderBookmarksPanel();
        }
    }

    /**
     * Description: Loads external stylesheets.
    */
    function addStyles() {
        ExtensionUtils.loadStyleSheet(module, 'css/bookmarks.css');
    }

    /**
     * Description: Adds menu commands.
    */
    function addMenuCommands() {
        var navigateMenu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU),
            viewMenu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU),
            registerCommandHandler = function (commandId, menuName, handler, shortcut, menu) {
                CommandManager.register(menuName, commandId, handler);
                menu.addMenuItem(commandId);
                KeyBindingManager.addBinding(commandId, shortcut);
            };

        navigateMenu.addMenuDivider();

        registerCommandHandler('georapbox.bookmarks.toggleBookmark', 'Toggle Bookmark', toggleBookmark, 'Ctrl-F4', navigateMenu);
        registerCommandHandler('georapbox.bookmarks.nextBookmark', 'Next Bookmark', nextBookmark, 'F4', navigateMenu);
        registerCommandHandler('georapbox.bookmarks.previousBookmark', 'Previous Bookmark', previousBookmark, 'Shift-F4', navigateMenu);
        registerCommandHandler('georapbox.bookmarks.clearBookmarks', 'Clear Bookmarks', clearBookmarks, 'Ctrl-Shift-F4', navigateMenu);
        registerCommandHandler('georapbox.bookmarks.viewBookmarks', 'Bookmarks', togglePanel, 'Ctrl-Alt-B', viewMenu);
    }

    function currentDocumentSaved() {
        renderBookmarksPanel();
        saveBookmarksToStorage();
    }

    /**
     * Description: Adds event listeners.
    */
    function addHandlers() {
        $bookmarksPanel = $('#georapbox-bookmarks-panel');

        $bookmarksPanel.on('click', '.close', function () {
            togglePanel();
        }).on('click', 'table tr', function (e) {
            if ($(this).find('td.file').attr('title') === _activeDocumentFilePath) {
                jumpToLine(_activeEditor, parseInt($(this).find('td.line').text(), 10) - 1);
                if ('INPUT' !== e.target.nodeName) {
                    _activeEditor.focus();
                }
            }
        }).on('click', 'td.delete', function () {
            if ($(this).parent().find('td.file').attr('title') === _activeDocumentFilePath) {
                jumpToLine(_activeEditor, parseInt($(this).parent().find('td.line').text(), 10) - 1);
                toggleBookmark('remove');
            }
        }).on('focusout', 'td.tag input', saveBookmarkLabel).
            on('change', '#georapbox-view-all input[type="checkbox"]', toggleBookmarksVisibility);

        $bmlIcon.on('click', togglePanel).
            appendTo('#main-toolbar .buttons');

        EditorManager.on('activeEditorChange', currentDocumentChanged).
            on('documentSaved', currentDocumentSaved);
    }

    /**
     * Description: Initialize the extension.
    */
    AppInit.appReady(function () {
        panel = WorkspaceManager.createBottomPanel('georapbox.bookmarks.panel', $(bookmarksPanelTemplate), 100);
        addStyles();
        addMenuCommands();
        addHandlers();
        currentDocumentChanged();
    });
});
