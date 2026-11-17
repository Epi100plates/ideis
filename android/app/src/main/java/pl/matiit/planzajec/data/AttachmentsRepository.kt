package pl.matiit.planzajec.data

import pl.matiit.planzajec.data.model.AttachmentIndexDto
import pl.matiit.planzajec.data.model.AttachmentListDto
import pl.matiit.planzajec.data.remote.AttachmentsRemote

/**
 * Cienka warstwa nad API materiałów. Świadomie bez cache'u na dysku: pliki i
 * linki zmieniają się często, a lista jest mała — pobieramy ją przy każdym
 * otwarciu szczegółów zajęć.
 */
class AttachmentsRepository(private val remote: AttachmentsRemote) {

    /**
     * Indeks „które zajęcia mają materiały” — jedna odpowiedź dla całego planu,
     * więc karty zajęć mogą rysować spinacz bez pytania o każdą z osobna.
     */
    suspend fun index(): AttachmentIndexDto = remote.index()

    suspend fun list(group: String, classId: String): AttachmentListDto =
        remote.list(group, classId)

    suspend fun upload(
        group: String,
        classId: String,
        fileName: String,
        bytes: ByteArray,
    ): AttachmentListDto = remote.upload(group, classId, fileName, bytes)

    suspend fun addLink(
        group: String,
        classId: String,
        url: String,
        title: String?,
    ): AttachmentListDto = remote.addLink(group, classId, url, title)

    suspend fun deleteFile(group: String, classId: String, id: String): AttachmentListDto =
        remote.deleteFile(group, classId, id)

    suspend fun deleteLink(group: String, classId: String, id: String): AttachmentListDto =
        remote.deleteLink(group, classId, id)
}
