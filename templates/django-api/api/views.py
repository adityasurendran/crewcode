from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json

_ITEMS: list = []


def health(_request):
    return JsonResponse({"ok": True, "service": "crewcode-django-api"})


def items(_request):
    return JsonResponse({"items": _ITEMS})


@csrf_exempt
@require_http_methods(["POST"])
def create_item(request):
    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON"}, status=400)
    name = str(data.get("name", "")).strip()
    if not name or len(name) > 200:
        return JsonResponse({"error": "name is required (max 200 chars)"}, status=400)
    item = {"id": len(_ITEMS) + 1, "name": name}
    _ITEMS.append(item)
    return JsonResponse({"ok": True, "item": item}, status=201)
