extends SceneTree
## Sonmodel projesinin içe aktardığı eski FBX karakterleri GLB olarak dışa verir.
## godot --headless --path Sonmodel --script fbx_disari.gd -- <cikti_klasoru> <bas> <son>

func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var cikti := a[0]
	for i in range(int(a[1]), int(a[2]) + 1):
		var yol := "res://Karakterler/%d.fbx" % i
		var ps: PackedScene = load(yol)
		if ps == null:
			print("## YUKLENEMEDI ", yol)
			continue
		var n := ps.instantiate()
		var doc := GLTFDocument.new()
		var st := GLTFState.new()
		var err := doc.append_from_scene(n, st)
		if err == OK:
			err = doc.write_to_filesystem(st, cikti.path_join("%d.glb" % i))
		print("## ", i, " -> ", "tamam" if err == OK else "HATA %d" % err)
		n.free()
	quit()
