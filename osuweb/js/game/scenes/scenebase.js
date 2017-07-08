"use strict";

/**
 * @abstract
 */
export class SceneBase {
    constructor() {
        if(this.constructor.name === "SceneBase") throw new Error("Call on abstract class SceneBase!");

        this.elements = {};

        this.addElement("backgroundDiv", "background");
        this.addElement("foregroundDiv", "foreground");
        this.addElement("osuwebCanvas", "osuweb");
        this.addElement("cursor", "cursor");

        return this;
    }

    addElement(name, id) {
        this.elements[name] = document.getElementById(id);
    }

    onMouseDown(position, key) {

    }

    onMouseMove(position) {

    }

    render() {

    }

    /**
     * Will be called for custom transition between scenes. If there
     * is a transition defined it should be executed and true
     * needs to be returned. This function should call pre/postOpen() and pre/postClose().
     */
    transition(newScene, callback) {
        callback(false);
    }

    preOpen(oldScene, callback) {
        Console.warn("Undefined method was called: "+(this.constructor.name)+".preOpen()");
        callback(true);
    }

    postOpen(oldScene, callback) {
        Console.warn("Undefined method was called: "+(this.constructor.name)+".postOpen()");
        callback(true);
    }

    preClose(newScene, callback) {
        Console.warn("Undefined method was called: "+(this.constructor.name)+".preClose()");
        callback(true);
    }

    postClose(newScene, callback) {
        Console.warn("Undefined method was called: "+(this.constructor.name)+".postOpen()");
        callback(true);
    }

    hideElements(elements) {
        for(let i = 0; i < elements.length; i++) {
            this.elements[elements[i]].style.display = "none";
        }
    }

    showElements(elements) {
        for(let i = 0; i < elements.length; i++) {
            this.elements[elements[i]].style.display = "block";
        }
    }
}