package pl.matiit.planzajec.data.local

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import pl.matiit.planzajec.core.PlanJson
import pl.matiit.planzajec.data.model.GroupsDto
import pl.matiit.planzajec.data.model.PlanDto

/**
 * Plan trzymany jako JSON w `filesDir/cache`. Zapis jest atomowy (unikalny plik
 * tymczasowy + `Files.move` z REPLACE_EXISTING), więc przerwanie procesu nie
 * zostawia uszkodzonego cache, a dwa równoległe zapisy (UI + WorkManager) nie
 * kłócą się o jedną nazwę pliku tymczasowego.
 */
class FilePlanStorage(context: Context) : PlanStorage {

    private val dir = File(context.filesDir, "cache").apply { mkdirs() }

    override fun readPlan(key: String): StoredPlan? {
        val file = planFile(key)
        if (!file.isFile) return null
        val plan = runCatching {
            PlanJson.decodeFromString(PlanDto.serializer(), file.readText())
        }.getOrNull() ?: return null
        return StoredPlan(plan, file.lastModified())
    }

    override fun writePlan(key: String, plan: PlanDto) {
        writeAtomic(planFile(key), PlanJson.encodeToString(PlanDto.serializer(), plan))
    }

    override fun readGroups(): StoredGroups? {
        val file = groupsFile()
        if (!file.isFile) return null
        val dto = runCatching {
            PlanJson.decodeFromString(GroupsDto.serializer(), file.readText())
        }.getOrNull() ?: return null
        return StoredGroups(dto, file.lastModified())
    }

    override fun writeGroups(groups: GroupsDto) {
        writeAtomic(groupsFile(), PlanJson.encodeToString(GroupsDto.serializer(), groups))
    }

    /**
     * Nazwa pliku wpisu: klucz to „21188” albo „21188@2025”. `@` jest bezpieczny
     * w nazwie pliku na Androida, ale i tak przepuszczamy tylko cyfry i `@`,
     * żeby żadna wartość z sieci nie mogła wyjść z katalogu cache.
     */
    private fun planFile(key: String) = File(dir, "plan-${key.filter { it.isDigit() || it == '@' }}.json")

    private fun groupsFile() = File(dir, "groups.json")

    private fun writeAtomic(target: File, text: String) {
        // Unikalna nazwa: równoległy zapis tego samego pliku nie nadpisze
        // drugiemu pliku tymczasowego w trakcie zapisu.
        val tmp = File.createTempFile("${target.name}-", ".tmp", target.parentFile)
        try {
            FileOutputStream(tmp).use { out ->
                out.write(text.toByteArray())
                out.flush()
                out.fd.sync()
            }
            try {
                Files.move(
                    tmp.toPath(),
                    target.toPath(),
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE,
                )
            } catch (e: AtomicMoveNotSupportedException) {
                Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            tmp.delete()
        }
    }
}
