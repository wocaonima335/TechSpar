"""语音转写模块：基于 FunASR Paraformer-zh 的本地语音识别。"""
import tempfile
import os
from pathlib import Path

_model = None


def _get_model():
    """懒加载 FunASR 模型，首次调用时下载并缓存。"""
    global _model
    if _model is None:
        from funasr import AutoModel
        _model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
        )
    return _model


def transcribe_audio(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """将音频字节流转写为文字。

    Args:
        audio_bytes: 音频文件的原始字节
        suffix: 文件后缀，用于 ffmpeg 识别格式

    Returns:
        识别出的文字字符串
    """
    model = _get_model()

    # FunASR 需要文件路径输入
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        result = model.generate(input=tmp_path)
        if result and len(result) > 0:
            # result 是 list[dict]，每个 dict 有 "text" 字段
            texts = []
            for item in result:
                if isinstance(item, dict) and "text" in item:
                    texts.append(item["text"])
                elif isinstance(item, str):
                    texts.append(item)
            return "".join(texts)
        return ""
    finally:
        os.unlink(tmp_path)
