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
        AppInit = brackets.getModule('utils/AppInit'),
        
        $bmlIcon = $('<a title="Bookmarks" id="georapbox-bookmarks-icon"></a>'),
        bookmarksPanelTemplate = require('text!html/bookmarks-panel.html'),
        bookmarksRowTemplate = require('text!html/bookmarks-row.html'),
        panel,
        $bookmarksPanel,
        
        COMMAND_ID = 'georapbox_execute',
        
        _activeEditor = null,
        _activeDocument = null,
        _activeBookmarks = [];
    
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
        localStorage.removeItem('georapbox.bookmarks');
        localStorage.setObj('georapbox.bookmarks', _activeBookmarks);
    }
    
    /**    
     * Description: Loads bookmarks from localStorage
     */
    function loadBookmarksFromStorage() {
        var storedBookmarks = localStorage.getObj('georapbox.bookmarks') || [],
            editor = EditorManager.getCurrentFullEditor(),
            _codeMirror = editor._codeMirror,
            i = 0,
            len = storedBookmarks.length;
        
        for (i; i < len; i++) {
            _activeBookmarks.push({
                originalLineNum: storedBookmarks[i].originalLineNum,
                ch: 0,
                fileName: storedBookmarks[i].fileName,
                filePath: storedBookmarks[i].filePath,
                label: storedBookmarks[i].label
            });

            if (storedBookmarks[i].filePath === _activeDocument.file._path) {
                _activeBookmarks[i].bookmark = _codeMirror.setBookmark({ line: storedBookmarks[i].originalLineNum, ch: 0 });
                _codeMirror.addLineClass(storedBookmarks[i].originalLineNum, null, 'georapbox-bookmarks-bookmark');
            }
        }
    }
    
    
    /**    
     * Description: Refreshes bookmarks when document changes.
    */
    function refreshBookmarks() {
        var _codeMirror = _activeEditor._codeMirror,
            i = 0,
            len = _activeBookmarks.length;
        
        for (i; i < len; i++) {
            if (_activeBookmarks[i].filePath === _activeDocument.file._path) {
                _activeBookmarks[i].bookmark = _codeMirror.setBookmark({ line: _activeBookmarks[i].originalLineNum, ch: 0 });
                _codeMirror.addLineClass(_activeBookmarks[i].originalLineNum, null, 'georapbox-bookmarks-bookmark');
            }
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
    function renderBookmarks() {
        if (panel.isVisible()) {
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
                
                if (fileColumn.attr('title') !== _activeDocument.file._path) {
                    $(this).addClass('inactive');
                } else {
                    $(this).removeClass('inactive');
                }
            });
            
            toggleBookmarksVisibility();
        }
        
        return false;
    }
    
    /**    
     * Description: Toggles Bookmark.
     * @param {String} action (optional) Description: If value is 'remove' it removes the current bookmark.
    */
    function toggleBookmark(action) {
        function addBookmark(editor, pos) {
            var _codeMirror = editor._codeMirror,
                bookmark = _codeMirror.setBookmark({
                    line: pos.line,
                    ch: 0
                }),
                marker = _codeMirror.addLineClass(pos.line, null, 'georapbox-bookmarks-bookmark');
            
            _activeBookmarks.push({
                originalLineNum: pos.line,
                ch: 0,
                bookmark: bookmark,
                fileName: _activeDocument.file._name,
                filePath: _activeDocument.file._path,
                label: 'BOOKMARK'
            });
            
            _activeBookmarks.sort(function (a, b) {
                return a.originalLineNum - b.originalLineNum;
            });
        }
        
        function removeBookmark(editor, pos) {
            var linenum = pos.line,
                _codeMirror = editor._codeMirror,
                i = 0;

            for (i = 0; i < _activeBookmarks.length; i++) {
                var bookmark = _activeBookmarks[i].bookmark,
                    bmLinenum = bookmark.find().line;
                    
                if (bmLinenum === linenum && _activeBookmarks[i].filePath === _activeDocument.file._path) {
                    bookmark.clear();
                    _codeMirror.removeLineClass(pos.line, null, 'georapbox-bookmarks-bookmark');
                    _activeBookmarks.splice(i, 1);
                    break;
                }
            }
        }

        var editor = EditorManager.getCurrentFullEditor(),
            _codeMirror = editor._codeMirror,
            pos = _codeMirror.getCursor(),
            line = pos.line,
            lineInfo = _codeMirror.lineInfo(line),
            markerClass = lineInfo.wrapClass;
        
        if ((markerClass && markerClass.indexOf('georapbox-bookmarks-bookmark') > -1) || action === 'remove') {
            removeBookmark(editor, pos);
        } else {
            addBookmark(editor, pos);
        }
        
        saveBookmarksToStorage();
        renderBookmarks(); // Prints bookmarks on panel.
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
            if (_activeBookmarks[i].filePath === _activeDocument.file._path) {
                linenum = _activeBookmarks[i].originalLineNum;
            
                if (linenum > currentLinenum) {
                    jumpToLine(_activeEditor, linenum);
                    found = true;
                    break;
                }
            }
        }
        
        if (!found) {
            for (i = 0; i < len; i++) {
                if (_activeBookmarks[i].filePath === _activeDocument.file._path) {
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
            if (_activeBookmarks[i].filePath === _activeDocument.file._path) {
                linenum = _activeBookmarks[i].originalLineNum;
                
                if (linenum < currentLinenum) {
                    jumpToLine(_activeEditor, linenum);
                    found = true;
                    break;
                }
            }
        }
        
        if (!found) {
            for (i = len - 1; i >= 0; i--) {
                if (_activeBookmarks[i].filePath === _activeDocument.file._path) {
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
            if (_activeBookmarks[i].filePath === _activeDocument.file._path) {
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
        renderBookmarks();
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
            if (filePath === _activeBookmarks[i].filePath && _activeBookmarks[i].originalLineNum === lineNum) {
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
            renderBookmarks();
        }
    }
    
    /**    
     * Description: Actions that take place when document changes.
    */
    function currentDocumentChanged() {
        _activeEditor = EditorManager.getCurrentFullEditor();
        _activeDocument = DocumentManager.getCurrentDocument();
        
        if (_activeDocument) {
            refreshBookmarks();
            renderBookmarks();
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
    
    /**    
     * Description: Adds event listeners.
    */
    function addHandlers() {
        $bookmarksPanel = $('#georapbox-bookmarks-panel');
        
        $bookmarksPanel.on('click', '.close', function () {
            togglePanel();
        }).on('click', 'table tr', function () {
            if ($(this).find('td.file').attr('title') === _activeDocument.file._path) {
                jumpToLine(_activeEditor, parseInt($(this).find('td.line').text(), 10) - 1);
            }
        }).on('click', 'td.delete', function () {
            if ($(this).parent().find('td.file').attr('title') === _activeDocument.file._path) {
                jumpToLine(_activeEditor, parseInt($(this).parent().find('td.line').text(), 10) - 1);
                toggleBookmark('remove');
            }
        }).on('focusout', 'td.tag input', saveBookmarkLabel).
            on('change', '#georapbox-view-all input[type="checkbox"]', toggleBookmarksVisibility);
        
        $bmlIcon.on('click', togglePanel).
            appendTo('#main-toolbar .buttons');
        
        $(DocumentManager).on('currentDocumentChange', currentDocumentChanged).
            on('documentSaved', renderBookmarks);
    }
    
    /**
     * Description: Initialize the extension.
    */
    AppInit.appReady(function () {
        panel = PanelManager.createBottomPanel('georapbox.bookmarks.panel', $(bookmarksPanelTemplate), 200);
        addStyles();
        addMenuCommands();
        addHandlers();
        currentDocumentChanged();
        loadBookmarksFromStorage();
    });
});
