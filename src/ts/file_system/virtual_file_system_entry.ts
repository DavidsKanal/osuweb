export class VirtualFileSystemEntry {
    public parent: VirtualFileSystemEntry = null;
    public name: string;

    constructor() {

    }

    setParent(newParent: VirtualFileSystemEntry) {
        if (this.parent) {
            throw new Error("Changing parents is not yet supported.");
        } else {
            this.parent = newParent;
        }
    }
}