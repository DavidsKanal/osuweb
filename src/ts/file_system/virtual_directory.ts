import { VirtualFileSystemEntry } from "./virtual_file_system_entry";
import { VirtualFile } from "./virtual_file";

export class VirtualDirectory extends VirtualFileSystemEntry {
	private entries: Map<string, VirtualFileSystemEntry>;
	private caseInsensitiveEntries: Map<string, VirtualFileSystemEntry>;
	public networkFallbackUrl: string;
	public failedNetworkFallbacks: Set<string>; // In order to prevent hitting the network twice for a 404 resource.

	constructor(name: string) {
		super();

		this.name = name;
		this.networkFallbackUrl = null;
		this.entries = new Map();
		this.caseInsensitiveEntries = new Map();
		this.failedNetworkFallbacks = new Set();
	}

	addEntry(entry: VirtualFileSystemEntry) {
		this.entries.set(entry.name, entry);
		this.caseInsensitiveEntries.set(entry.name.toLowerCase(), entry);

		entry.setParent(this);
	}

	removeEntry(entry: VirtualFileSystemEntry) {
		this.entries.delete(entry.name);
		this.caseInsensitiveEntries.delete(entry.name.toLowerCase());
	}

	async getEntryByName(name: string, caseInsensitive = false) {
		if (name !== null && name !== undefined) {
			let entry = caseInsensitive? this.caseInsensitiveEntries.get(name.toLowerCase()) : this.entries.get(name);
			if (entry) return entry;
		}

		if (this.networkFallbackUrl) {
			let url = this.networkFallbackUrl + '/' + name;
			if (this.failedNetworkFallbacks.has(url)) return null;

			let response = await fetch(url);
			if (response.ok) {
				let blob = await response.blob();
				let file = VirtualFile.fromBlob(blob, name);

				this.addEntry(file);
				return file;
			} else {
				this.failedNetworkFallbacks.add(url);
			}
		}

		return null;
	}

	async getFileByName(name: string, caseInsensitive = false) {
		let entry = await this.getEntryByName(name, caseInsensitive);

		if (entry instanceof VirtualFile) return entry as VirtualFile;
		return null;
	}

	forEach(func: (entry: VirtualFileSystemEntry) => any) {
		this.entries.forEach((entry) => {
			func(entry);
		});
	}

	forEachFile(func: (entry: VirtualFile) => any) {
		this.entries.forEach((entry) => {
			if (entry instanceof VirtualFile) func(entry);
		});
	}

	/** Load all files in this directory. */
	loadShallow() {
		let arr: Promise<void>[] = [];
		this.forEach((entry) => {
			if (entry instanceof VirtualFile) arr.push(entry.load());
		});

		return Promise.all(arr);
	}

	/** Load all files in this directory and its subdirectories. */
	loadDeep() {
		let arr: Promise<void>[] = [];

		function addFilesInDirectory(dir: VirtualDirectory) {
			dir.forEach((entry) => {
				if (entry instanceof VirtualFile) arr.push(entry.load());
				else addFilesInDirectory(entry as VirtualDirectory);
			});
		}
		addFilesInDirectory(this);

		return Promise.all(arr);
	}

	static fromFileList(list: FileList) {
		let root = new VirtualDirectory("");

		function createIteratively(dir: VirtualDirectory, pathSegments: string[], index: number): VirtualDirectory {
			let currentDir = dir;

			while (true) {
				if (index >= pathSegments.length - 1) return currentDir;

				let entry = currentDir.entries.get(pathSegments[index]) as VirtualDirectory;
				if (!entry) {
					entry = new VirtualDirectory(pathSegments[index]);
					currentDir.addEntry(entry);
				}

				currentDir = entry;
				index++;
			}
		}

		let cache = new Map();

		for (let i = 0; i < list.length; i++) {
			let file = list[i];
			let relativePath = (file as any).webkitRelativePath as string;
			if (relativePath === undefined) throw new Error("webkitRelativePath not defined.");

			let d = relativePath.slice(0, relativePath.lastIndexOf("/"));
			let parentDir = cache.get(d) as VirtualDirectory;
			if (!parentDir) {
				let pathSegments = relativePath.split("/");
				root.name = pathSegments[0];

				parentDir = createIteratively(root, pathSegments, 1);
				cache.set(d, parentDir);
			}
			
			parentDir.addEntry(VirtualFile.fromFile(file));
		}

		return root;
	}
}