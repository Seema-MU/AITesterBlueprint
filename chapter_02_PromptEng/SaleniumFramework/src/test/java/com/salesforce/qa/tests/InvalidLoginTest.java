package com.salesforce.qa.tests;

import com.salesforce.qa.pages.LoginPage;
import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.Assert;
import org.testng.annotations.AfterTest;
import org.testng.annotations.BeforeTest;
import org.testng.annotations.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;

public class InvalidLoginTest {

    private WebDriver driver;
    private LoginPage loginPage;
    private static final String LOGIN_URL = "https://login.salesforce.com/?locale=in";
    private static final String SCREENSHOT_DIR = "screenshots";

    @BeforeTest
    public void setUp() {
        try {
            WebDriverManager.chromedriver().setup();
            driver = new ChromeDriver();
            driver.manage().window().maximize();
            driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
            loginPage = new LoginPage(driver);
        } catch (RuntimeException e) {
            throw new RuntimeException("Browser setup failed during @BeforeTest", e);
        }
    }

    @Test(description = "Verify invalid credentials show the expected error and do not redirect")
    public void invalidCredentialsTest() {
        try {
            loginPage.navigateToLoginPage(LOGIN_URL);
            Assert.assertTrue(loginPage.isLoginPageDisplayed(),
                    "Salesforce login page was not displayed before entering invalid credentials.");

            loginPage.doLogin("invalid.user@example.com", "WrongPass123!");
            Assert.assertTrue(loginPage.isErrorDisplayed(),
                    "Expected error message block was not displayed for invalid credentials.");
            String errorText = loginPage.getErrorMessageText();
            Assert.assertTrue(errorText.toLowerCase().contains("please check your username and password"),
                    "Unexpected error message text: " + errorText);
            Assert.assertTrue(loginPage.isUsernameFieldDisplayed(),
                    "Username field is no longer displayed after invalid login.");
            Assert.assertTrue(loginPage.isPasswordFieldDisplayed(),
                    "Password field is no longer displayed after invalid login.");
            Assert.assertTrue(loginPage.getCurrentUrlContainsLoginDomain(),
                    "Page redirected away from login domain after invalid credentials. Expected to stay on login.");
        } catch (AssertionError | RuntimeException e) {
            captureScreenshot("invalidCredentialsTest_failure");
            Assert.fail("Invalid credentials flow failed: " + e.getMessage());
        }
    }

    @Test(description = "Verify submitting empty username and password shows an error and stays on login page")
    public void emptyCredentialsTest() {
        try {
            loginPage.navigateToLoginPage(LOGIN_URL);
            Assert.assertTrue(loginPage.isLoginPageDisplayed(),
                    "Salesforce login page was not displayed before submitting empty fields.");

            loginPage.doLogin("", "");
            Assert.assertTrue(loginPage.isErrorDisplayed(),
                    "Expected error message block was not displayed for empty credentials.");
            String errorText = loginPage.getErrorMessageText();
            Assert.assertFalse(errorText.trim().isEmpty(),
                    "Error message text should not be empty for empty credentials submission.");
            Assert.assertTrue(loginPage.getCurrentUrlContainsLoginDomain(),
                    "Page redirected away from login domain after empty credentials. Expected to stay on login.");
        } catch (AssertionError | RuntimeException e) {
            captureScreenshot("emptyCredentialsTest_failure");
            Assert.fail("Empty credentials flow failed: " + e.getMessage());
        }
    }

    @AfterTest(alwaysRun = true)
    public void tearDown() {
        if (driver != null) {
            try {
                driver.quit();
            } catch (RuntimeException e) {
                System.err.println("Error while quitting WebDriver during @AfterTest: " + e.getMessage());
            }
        }
    }

    private void captureScreenshot(String testName) {
        try {
            if (!(driver instanceof TakesScreenshot)) {
                return;
            }
            Path dir = Paths.get(SCREENSHOT_DIR);
            Files.createDirectories(dir);
            File screenshot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
            Path destination = dir.resolve(testName + "_" + System.currentTimeMillis() + ".png");
            Files.copy(screenshot.toPath(), destination);
            System.err.println("Screenshot saved to: " + destination.toAbsolutePath());
        } catch (IOException | RuntimeException e) {
            System.err.println("Failed to capture screenshot for " + testName + ": " + e.getMessage());
        }
    }
}
