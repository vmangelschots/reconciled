from django.db import models


class Category(models.Model):
    """Minimal for now: just enough for transactions' category FK and the
    frontend's category picker (task 3.x). Task 4.1 adds CategoryLimit and
    the full category management API (create/rename/delete-with-
    reassignment) on top of this same model.
    """

    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name
