package pl.matiit.planzajec.ui.materials

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MaterialsValidationTest {

    @Test
    fun `przyjmuje poprawne adresy http i https`() {
        assertTrue(isHttpUrl("https://example.com/material.pdf"))
        assertTrue(isHttpUrl("http://example.com"))
    }

    @Test
    fun `odrzuca adresy bez schematu i ze spacjami`() {
        assertFalse(isHttpUrl("example.com/material"))
        assertFalse(isHttpUrl("ftp://example.com"))
        assertFalse(isHttpUrl("https://"))
        assertFalse(isHttpUrl("https://example.com/a b"))
        assertFalse(isHttpUrl(""))
    }
}
