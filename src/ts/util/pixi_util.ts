// The definition of "basic" is kind of ambiguous here, but I don't know what else to call it.
export function transferBasicProperties(source: PIXI.Container, target: PIXI.Container) {
	target.position.copyFrom(source.position);
	target.rotation = source.rotation;
	target.scale.copyFrom(source.scale);
	target.pivot.copyFrom(source.pivot);
}

export function transferBasicSpriteProperties(source: PIXI.Sprite, target: PIXI.Sprite) {
	target.texture = source.texture;
	target.width = source.width;
	target.height = source.height;
	target.anchor.copyFrom(source.anchor);
}

export function fitSpriteIntoContainer(sprite: PIXI.Sprite, containerWidth: number, containerHeight: number, anchorPoint = new PIXI.Point(0.5, 0.5)) {
	let texture = sprite.texture;
	let ratio = texture.height/texture.width;

	if (containerWidth * ratio >= containerHeight) {
		sprite.width = containerWidth;
		sprite.height = containerWidth * ratio;
		
		let spare = containerWidth * ratio - containerHeight;
		sprite.y = -spare * anchorPoint.y;
		sprite.x = 0;
	} else {
		sprite.height = containerHeight;
		sprite.width = containerHeight / ratio;

		let spare = containerHeight / ratio - containerWidth;
		sprite.x = -spare * anchorPoint.x;
		sprite.y = 0;
	}
}