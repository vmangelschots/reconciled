from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .format import BackupError, backup_filename, build_backup, dump_backup, read_backup, restore_backup


class BackupView(APIView):
    """Download every backed-up row as one JSON file."""

    def get(self, request):
        response = HttpResponse(dump_backup(build_backup()), content_type="application/json")
        response["Content-Disposition"] = f'attachment; filename="{backup_filename()}"'
        return response


class RestoreView(APIView):
    """Replace everything with a backup file's data (multipart "file")."""

    parser_classes = [MultiPartParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "Choose a backup file to restore."}, status=400)
        try:
            restored = restore_backup(read_backup(file_obj.read()))
        except BackupError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(restored)
