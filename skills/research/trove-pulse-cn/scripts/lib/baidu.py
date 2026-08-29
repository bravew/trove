"""百度搜索模块 - 替代 Exa/Brave 等 Web 搜索后端。

Author: Jesse (https://github.com/Jesseovo)

v2.1 改动：
- 更真实的浏览器头（Accept-Language/Referer/Sec-Fetch-*）+ UA 轮换
- 若检测到「百度安全验证」拦截页，主动记录日志并降级
- 新增 Bing 国内版兜底（`https://cn.bing.com/search`）
- 同时兼容百度新版 HTML 的 `result c-container` 块级选择器
"""

import json
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from . import relevance

_UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

_ANTIBOT_SIGNATURES = (
    "wappass.baidu.com",
    "百度安全验证",
    "百度智能云验证",
    "verify.baidu.com",
    "/static/verify",
)


def search_baidu(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    api_key: Optional[str] = None,
    secret_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """搜索百度网页。

    Args:
        topic: 搜索关键词
        from_date: 起始日期
        to_date: 结束日期
        depth: 搜索深度
        api_key: 百度 API Key（可选）
        secret_key: 百度 Secret Key（可选）

    Returns:
        网页搜索结果列表
    """
    limit_map = {"quick": 10, "default": 20, "deep": 30}
    limit = limit_map.get(depth, 20)

    items: List[Dict[str, Any]] = []

    if api_key and secret_key:
        items = _search_via_api(topic, limit, api_key, secret_key)

    if not items:
        items = _search_via_public(topic, limit)

    if not items:
        items = _search_via_bing(topic, limit)

    scored = []
    for i, item in enumerate(items):
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        combined = f"{title} {snippet}"
        rel = relevance.token_overlap_relevance(topic, combined)
        item["id"] = f"BD{i+1}"
        item["relevance"] = rel
        item["why_relevant"] = f"{item.get('source_tag', '百度搜索')}：{title[:50]}"
        scored.append(item)

    scored.sort(key=lambda x: x.get("relevance", 0), reverse=True)
    return scored[:limit]


def _build_headers(referer: str) -> Dict[str, str]:
    ua = random.choice(_UA_POOL)
    return {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Referer": referer,
        "Sec-Ch-Ua": '"Chromium";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }


def _is_antibot_page(html: str) -> bool:
    if not html:
        return True
    if len(html) < 2000:
        return any(sig in html for sig in _ANTIBOT_SIGNATURES)
    return any(sig in html for sig in _ANTIBOT_SIGNATURES)


def _fetch(url: str, headers: Dict[str, str], timeout: int = 15) -> str:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _search_via_api(
    topic: str, limit: int, api_key: str, secret_key: str
) -> List[Dict[str, Any]]:
    """通过百度搜索 API 进行搜索。"""
    items = []
    try:
        encoded = urllib.parse.quote(topic)
        url = f"https://api.baidu.com/search/v1?q={encoded}&rn={limit}&key={api_key}"
        req = urllib.request.Request(url, headers={"User-Agent": _UA_POOL[0]})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        for r in data.get("result", []):
            items.append({
                "title": _clean_html(r.get("title", "")),
                "snippet": _clean_html(r.get("abstract", "") or r.get("description", "")),
                "url": r.get("url", ""),
                "source_domain": _extract_domain(r.get("url", "")),
                "date": r.get("date"),
                "date_confidence": "med" if r.get("date") else "low",
                "source_tag": "百度API",
            })
    except Exception as e:
        sys.stderr.write(f"[百度] API 搜索失败: {e}\n")
    return items


def _search_via_public(topic: str, limit: int) -> List[Dict[str, Any]]:
    """通过百度公开搜索（HTML 解析）。"""
    items: List[Dict[str, Any]] = []
    try:
        encoded = urllib.parse.quote(topic)
        now_ts = int(time.time())
        ago_ts = now_ts - 30 * 86400
        url = (
            f"https://www.baidu.com/s?wd={encoded}&rn={min(limit, 20)}"
            f"&gpc=stf%3D{ago_ts}%2C{now_ts}%7Cstftype%3D1"
        )
        headers = _build_headers("https://www.baidu.com/")
        html = _fetch(url, headers)

        if _is_antibot_page(html):
            sys.stderr.write(
                "[百度] 公开搜索被安全验证拦截，已自动降级到 Bing 兜底。"
                "建议配置 BAIDU_API_KEY/BAIDU_SECRET_KEY 以获得稳定结果。\n"
            )
            return []

        container_blocks = re.findall(
            r'<div[^>]*class="[^"]*result[^"]*c-container[^"]*"[^>]*>([\s\S]*?)</div>\s*(?=<div[^>]*class="[^"]*result|<div[^>]*id="content_bottom)',
            html,
        )

        for block in container_blocks[:limit]:
            title_match = re.search(
                r'<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                block,
                re.S,
            )
            if not title_match:
                continue
            href = title_match.group(1)
            title = _clean_html(title_match.group(2))

            snippet = ""
            snip_match = re.search(
                r'<span[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)</span>',
                block,
            )
            if not snip_match:
                snip_match = re.search(
                    r'<span[^>]*class="[^"]*c-font-normal[^"]*"[^>]*>([\s\S]*?)</span>',
                    block,
                )
            if snip_match:
                snippet = _clean_html(snip_match.group(1))

            items.append({
                "title": title,
                "snippet": snippet,
                "url": href,
                "source_domain": _extract_domain(href),
                "date": None,
                "date_confidence": "low",
                "source_tag": "百度",
            })

        if not items:
            results = re.findall(
                r'<h3[^>]*class="[^"]*t[^"]*"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>',
                html,
                re.S,
            )
            snippets = re.findall(
                r'<span class="content-right_8Zs40">(.*?)</span>', html, re.S
            )
            for idx, (href, title_html) in enumerate(results[:limit]):
                title = _clean_html(title_html)
                snippet = _clean_html(snippets[idx]) if idx < len(snippets) else ""
                items.append({
                    "title": title,
                    "snippet": snippet,
                    "url": href,
                    "source_domain": _extract_domain(href),
                    "date": None,
                    "date_confidence": "low",
                    "source_tag": "百度",
                })
    except Exception as e:
        sys.stderr.write(f"[百度] 公开搜索失败: {e}\n")
    return items


def _search_via_bing(topic: str, limit: int) -> List[Dict[str, Any]]:
    """Bing 国内版兜底搜索，避免百度完全失效时返回 0 条。"""
    items: List[Dict[str, Any]] = []
    try:
        encoded = urllib.parse.quote(topic)
        url = f"https://cn.bing.com/search?q={encoded}&setmkt=zh-CN&ensearch=0"
        headers = _build_headers("https://cn.bing.com/")
        html = _fetch(url, headers)

        blocks = re.findall(
            r'<li class="b_algo"[^>]*>([\s\S]*?)</li>',
            html,
        )
        for block in blocks[:limit]:
            title_match = re.search(
                r'<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>\s*</h2>',
                block,
                re.S,
            )
            if not title_match:
                continue
            href = title_match.group(1)
            title = _clean_html(title_match.group(2))

            snippet = ""
            snip_match = re.search(
                r'<p[^>]*class="b_lineclamp\d*\s*b_algoSlug"[^>]*>([\s\S]*?)</p>',
                block,
            ) or re.search(r"<p[^>]*>([\s\S]*?)</p>", block)
            if snip_match:
                snippet = _clean_html(snip_match.group(1))

            items.append({
                "title": title,
                "snippet": snippet,
                "url": href,
                "source_domain": _extract_domain(href),
                "date": None,
                "date_confidence": "low",
                "source_tag": "Bing兜底",
            })
    except Exception as e:
        sys.stderr.write(f"[百度] Bing 兜底搜索失败: {e}\n")
    return items


def _clean_html(text: str) -> str:
    """清除 HTML 标签。"""
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _extract_domain(url: str) -> str:
    """从 URL 中提取域名。"""
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc
    except Exception:
        return ""
