#!/bin/sh
# Muck TikTok modunu derler ve oyunun BepInEx/plugins klasorune kopyalar.
# Gerekenler: .NET SDK 8 (Roslyn), Muck + BepInEx 5 kurulu.
set -e
OYUN="/c/Program Files (x86)/Steam/steamapps/common/Muck"
M="$OYUN/Muck_Data/Managed"
B="$OYUN/BepInEx/core"
CSC="/c/Program Files/dotnet/sdk/8.0.424/Roslyn/bincore/csc.dll"
cd "$(dirname "$0")"

dotnet "$CSC" -nologo -target:library -langversion:7.3 -optimize+ -nostdlib+ -noconfig \
  -out:MuckTikTok.dll \
  -r:"$M/mscorlib.dll" -r:"$M/System.dll" -r:"$M/System.Core.dll" -r:"$M/netstandard.dll" \
  -r:"$M/UnityEngine.dll" -r:"$M/UnityEngine.CoreModule.dll" -r:"$M/UnityEngine.IMGUIModule.dll" \
  -r:"$M/UnityEngine.InputLegacyModule.dll" -r:"$M/UnityEngine.PhysicsModule.dll" \
  -r:"$M/UnityEngine.TextRenderingModule.dll" -r:"$M/UnityEngine.JSONSerializeModule.dll" \
  -r:"$M/UnityEngine.ImageConversionModule.dll" -r:"$M/UnityEngine.AnimationModule.dll" \
  -r:"$M/Assembly-CSharp.dll" -r:"$B/BepInEx.dll" \
  $(for f in ikonlar/*.png; do printf -- '-resource:%s,%s ' "$f" "$(basename "$f")"; done) \
  MuckTikTok.cs Portreler.cs

mkdir -p "$OYUN/BepInEx/plugins"
cp MuckTikTok.dll "$OYUN/BepInEx/plugins/"
echo "Kuruldu: $OYUN/BepInEx/plugins/MuckTikTok.dll"
