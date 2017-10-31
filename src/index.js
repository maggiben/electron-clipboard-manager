// @flow

///////////////////////////////////////////////////////////////////////////////
// @file         : ClipBoardManager.js                                          //
// @summary      : Clipboard events and data manager                         //
// @version      : 1.0.0                                                     //
// @project      : tickelr                                                   //
// @description  :                                                           //
// @author       : Benjamin Maggi                                            //
// @email        : benjaminmaggi@gmail.com                                   //
// @date         : 28 Oct 2017                                               //
// @license:     : MIT                                                       //
// ------------------------------------------------------------------------- //
//                                                                           //
// Copyright 2017 Benjamin Maggi <benjaminmaggi@gmail.com>                   //
//                                                                           //
//                                                                           //
// License:                                                                  //
// Permission is hereby granted, free of charge, to any person obtaining a   //
// copy of this software and associated documentation files                  //
// (the "Software"), to deal in the Software without restriction, including  //
// without limitation the rights to use, copy, modify, merge, publish,       //
// distribute, sublicense, and/or sell copies of the Software, and to permit //
// persons to whom the Software is furnished to do so, subject to the        //
// following conditions:                                                     //
//                                                                           //
// The above copyright notice and this permission notice shall be included   //
// in all copies or substantial portions of the Software.                    //
//                                                                           //
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS   //
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF                //
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.    //
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY      //
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,      //
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE         //
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                    //
//                                                                           //
///////////////////////////////////////////////////////////////////////////////

import { clipboard, ipcRenderer } from 'electron';
import { EventEmitter } from 'events';
import isEmpty from 'lodash/isEmpty';

/**
  - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ -
  - Stick to Mandatory data types                                         -
  - Reference: https://w3c.github.io/clipboard-apis/#mandatory-data-types -
  - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ - ~ -

  Reading:
  --------
  'text/plain',
  'text/uri-list',
  'text/csv',
  'text/css',
  'text/html',
  'application/xhtml+xml',
  'image/png',
  'image/jpg,
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'application/xml,
  'text/xml',
  'application/javascript',
  'application/json',
  'application/octet-stream'

  Writing:
  --------
  'text/plain',
  'text/uri-list',
  'text/csv',
  'text/html',
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'application/json',
*/

export class ClipBoardReader {

  static defaultReaders = new Map([
    // [
    //   'text/plain', [
    //     function(clipboard, ...args) {
    //       const sum = Array.prototype.concat(...args).reduce((a, b) => a + b, 0);
    //       const text = clipboard.readText();
    //       return `${text}: ${sum}`;
    //     }
    //   ]
    // ],
    [ 'text/plain',
      [ function(clipboard, ...args) { return clipboard.readText() } ]
    ],
    [ 'text/html',
      [ function(clipboard, ...args) { return clipboard.readHTML() } ]
    ]
  ]);

  static get defaults() {
    return {
      supportedReaders: ClipBoardReader.defaultReaders
    };
  };

  constructor(clipboard:? Object, options?: Object) {
    this.options = { ...ClipBoardReader.defaults, ...options };
    this.clipboard = clipboard || require('electron').clipboard;
  }

  get supportedFormats() {
    const { options: { supportedReaders: supported } } = this;
    return supported.size ? supported.keys() : undefined;
  }

  get isValidFormat() {
    try {
      const { options: { supportedReaders: supported }, availableFormats: available } = this;
      return (available && supported.size) ? available.some(format => supported.has(format)) : false;
    } catch (error) { console.error(error); return false; }
  }

  get availableFormats() {
    const formats = this.clipboard.availableFormats();
    return !!(formats.length) ? formats : undefined;
  }

  get availableReaders() {
    if (!this.isValidFormat) return undefined;
    const { options: { supportedReaders: supported }, availableFormats: available } = this;
    return available
      .filter(format => supported.has(format))
      .map(format => [ format, supported.get(format) ]);
  }

  addReader(format, hanlder, useCapture) {
    return this.supportedReaders.set(format, handler);
  }

  removeReader(format, handler) {

  }

  getReader(format) {
    return this.supportedReaders.get(format);
  }

  invokeReader(thisArg, ...args) {
    console.log('invokeReader', this)
    const { clipboard } = this
    return (reader) => Reflect.apply(reader, thisArg, [ clipboard, ...args ] );
  }

  /* Read data from clipboard */
  read(...args) {
    if (!this.isValidFormat) return;
    return this.availableReaders.map(([format, readers]) => [ format, readers.map(this.invokeReader(args)) ]);
  }
}

export default class ClipBoardManager {

  static emitterSym = Symbol('emitter');
  static get defaults() {
    return {
      interval: 500,
      supportedFormats: ['text/plain']
    };
  };

  constructor(options?: Object) {
    this.options = { ...ClipBoardManager.defaults, ...options };
    this.events = new EventEmitter();
    this.clipboardReader = new ClipBoardReader();
    this.listeners = {
      clipboard: this.handleClipboardEvents(),
      // window: this.handleWindowEvents()
    };
  }

  get watchInterval() {
    const { options: { interval } } = this;
    return interval;
  }

  get availableFormats() {
    return clipboard.availableFormats();
  }

  get isValidFormat() {
    const { options: { supportedFormats }, availableFormats } = this;
    return supportedFormats.some(format => availableFormats.includes(format));
  }

  /* get the event handler emitter symbol */
  getEmitter(events) {
    const emitterSym = ClipBoardManager.emitterSym;
    if (Object.getOwnPropertySymbols(events).includes(emitterSym)) {
      return events[emitterSym];
    } else {
      return undefined;
    }
  }

  /* Register an event handler of a specific event type on the EventTarge */
  listen(target, listener, defaults) : Function {
    const emitter = this.getEmitter(listener);
    return (event, options) => {
      target.addEventListener(event, listener[event], { ...defaults, ...options });
      return () => this.forget(target, listener).apply(this, [ event, { ...defaults, ...options } ]);
    };
  }

  /* Removes an event listener from the EventTarget */
  forget(target, listener, defaults) : Function {
    const emitter = this.getEmitter(listener);
    return (event, options) => {
      return target.removeEventListener(event, listener[event], { ...defaults, ...options });
    }
  }

  reverse(string) {
    return string.split('').reverse().join('');
  }

  /* Handle clipboard events */
  handleClipboardEvents() {
    const emitterSym = ClipBoardManager.emitterSym;
    const clipboardEvents = window.clipboardEvents = {
      paste: (event) => {
        this.events.emit('paste', event); console.log('paste');
        const datum = this.clipboardReader.read(this, 1, 2, 3, 4);
        console.log('READER', datum);
        // this.decode();
        return event.preventDefault();
      },
      copy: (event) => {
        this.events.emit('copy', event); console.log('copy');
        return event.preventDefault();
      },
      cut: (event) => {
        this.events.emit('cut', event); console.log('cut');
        return event.preventDefault();
      },
      [emitterSym]: {
        count: 0,
        listeners: new Map(),
        eventNames: () => Object.keys(clipboardEvents),
        on: (event, options) => {
          return this.listen(document, clipboardEvents).apply(this, [ event, options ]);
        },
        off: (event, options) => {
          return this.forget(document, clipboardEvents).apply(this, [ event, options ]);
        }
      }
    };

    /* Start listening clipboard events */
    const emitter = this.getEmitter(clipboardEvents);
    return [
      emitter.on('paste'),
      emitter.on('copy'),
      emitter.on('cut')
    ];
  }

  /**
   * Poll the system clipboard
   * @param  {number} [interval] in ms between polls
   * @return {number|boolean} timer id or false
   */
  startWatching(interval?: number = this.watchInterval) {
    console.log('startWatching');
    this.events.emit('startWatching');
    return this.timer = !(this.timer) ? (this.timer = setInterval(() => this.decode(), interval)) : false;
  }

  stopWatching() {
    console.log('stopWatching');
    this.events.emit('stopWatching');
    return this.timer = !!(this.timer) ? (this.timer = clearInterval(this.timer) & false) : false;
  }

  /* Handle window events */
  handleWindowEvents() {
    const emitterSym = ClipBoardManager.emitterSym;
    const windowEvents = this.windowEvents = {
      blur: (event) => {
        emitter.once('focus');
        return this.startWatching(event);
      },
      focus: (event) => {
        emitter.once('blur');
        return this.stopWatching(event);
      },
      [emitterSym]: {
        count: 0,
        listeners: new Map(),
        eventNames: () => Object.keys(windowEvents),
        once: (event, options) => {
          windowEvents[emitterSym].count += 1;
          return this.listen(window, windowEvents, { once: true }).apply(this, [ event, options ]);
        },
        off: (event, options) => {
          windowEvents[emitterSym].count -= 1;
          return this.forget(window, windowEvents, { once: true }).apply(this, [ event, options ]);
        }
      }
    };

    /* Start watching */
    const emitter = this.getEmitter(windowEvents);
    return emitter.once('blur');
  }

  /* Self destruct sequence */
  destroy() {
    Object
    .values(this.listeners)
    .reduce((listeners, listener) => listeners.concat(listener), [])
    .forEach(listener => listener.apply(this, null));
  }

  /* Tell if there is any difference between 2 strings */
  isDiffText(a, b) {
    return !isEmpty(a) && !isEmpty(b) ? (b !== a) : true;
  }

  /* Tell if there is any difference between 2 images */
  isDiffImage(a, b) {
    return !a.isEmpty() && b.toDataURL() !== a.toDataURL()
  }

  decode(skip) {
    if (!this.isValidFormat) return;
    const text = clipboard.readText();
    if (!this.isDiffText(text, this.text)) return;
    console.log('decode', text, this.timer, this.isValidFormat, this.availableFormats);
    return this.text = text;
  }
}
