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

public class ValidLoginTest {

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

    @Test(description = "Verify Salesforce login page loads and valid credentials log in successfully")
    public void validLoginTest() {
        String validUsername = System.getenv("SF_USERNAME");
        String validPassword = System.getenv("SF_PASSWORD");
        Assert.assertNotNull(validUsername, "Environment variable SF_USERNAME is not set. "
                + "Set it to a valid Salesforce username before running the valid login test.");
        Assert.assertNotNull(validPassword, "Environment variable SF_PASSWORD is not set. "
                + "Set it to the password for SF_USERNAME before running the valid login test.");

        try {
            loginPage.navigateToLoginPage(LOGIN_URL);
            Assert.assertTrue(loginPage.isLoginPageDisplayed(),
                    "Salesforce login page UI elements (title, username field, forgot password link) were not displayed.");
            Assert.assertTrue(loginPage.isRememberMeCheckboxDisplayed(),
                    "Remember me checkbox was not displayed or was disabled.");
            Assert.assertTrue(loginPage.isRememberMeCheckboxSelected(),
                    "Remember me checkbox was not selected by default.");

            loginPage.doLogin(validUsername, validPassword);
            String redirectedUrl = loginPage.waitForRedirectAwayFromLogin();
            Assert.assertFalse(loginPage.isLoginFieldPresent(),
                    "Login fields are still present after a valid login. Expected redirect to the Salesforce org.");
            Assert.assertNotNull(redirectedUrl, "Redirected URL should not be null after valid login.");
        } catch (AssertionError | RuntimeException e) {
            captureScreenshot("validLoginTest_failure");
            Assert.fail("Valid login flow failed: " + e.getMessage());
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
