package com.salesforce.qa.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class LoginPage {

    private final WebDriver driver;
    private static final Duration EXPLICIT_WAIT_SECONDS = Duration.ofSeconds(30);

    @FindBy(xpath = "//input[@id='username']")
    private WebElement usernameField;

    @FindBy(xpath = "//input[@id='password']")
    private WebElement passwordField;

    @FindBy(xpath = "//input[@id='Login']")
    private WebElement loginButton;

    @FindBy(xpath = "//input[@id='rememberUn']")
    private WebElement rememberMeCheckbox;

    @FindBy(xpath = "//div[@id='error']")
    private WebElement errorMessage;

    @FindBy(xpath = "//a[@id='forgot_password_link']")
    private WebElement forgotPasswordLink;

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        PageFactory.initElements(driver, this);
    }

    private WebElement waitForElementVisible(By locator) {
        try {
            return new WebDriverWait(driver, EXPLICIT_WAIT_SECONDS)
                    .until(ExpectedConditions.visibilityOfElementLocated(locator));
        } catch (TimeoutException e) {
            throw new RuntimeException("Element not visible within " + EXPLICIT_WAIT_SECONDS.getSeconds()
                    + " seconds. Locator: " + locator, e);
        }
    }

    public void navigateToLoginPage(String loginUrl) {
        try {
            driver.get(loginUrl);
            waitForElementVisible(By.xpath("//input[@id='username']"));
        } catch (RuntimeException e) {
            throw new RuntimeException("Failed to load Salesforce login page: " + loginUrl, e);
        }
    }

    public boolean isLoginPageDisplayed() {
        try {
            boolean titleMatches = driver.getTitle().toLowerCase().contains("salesforce");
            boolean usernameVisible = usernameField.isDisplayed();
            boolean forgotLinkVisible = forgotPasswordLink.isDisplayed();
            return titleMatches && usernameVisible && forgotLinkVisible;
        } catch (RuntimeException e) {
            throw new RuntimeException("Unable to verify Salesforce login page UI elements", e);
        }
    }

    public boolean isRememberMeCheckboxDisplayed() {
        try {
            return rememberMeCheckbox.isDisplayed() && rememberMeCheckbox.isEnabled();
        } catch (RuntimeException e) {
            throw new RuntimeException("Unable to verify remember me checkbox state", e);
        }
    }

    public void enterUsername(String username) {
        try {
            waitForElementVisible(By.xpath("//input[@id='username']")).clear();
            waitForElementVisible(By.xpath("//input[@id='username']")).sendKeys(username);
        } catch (RuntimeException e) {
            throw new RuntimeException("Failed to enter username", e);
        }
    }

    public void enterPassword(String password) {
        try {
            waitForElementVisible(By.xpath("//input[@id='password']")).clear();
            waitForElementVisible(By.xpath("//input[@id='password']")).sendKeys(password);
        } catch (RuntimeException e) {
            throw new RuntimeException("Failed to enter password", e);
        }
    }

    public void clickLoginButton() {
        try {
            waitForElementVisible(By.xpath("//input[@id='Login']")).click();
        } catch (RuntimeException e) {
            throw new RuntimeException("Failed to click the Login button", e);
        }
    }

    public void doLogin(String username, String password) {
        try {
            enterUsername(username);
            enterPassword(password);
            clickLoginButton();
        } catch (RuntimeException e) {
            throw new RuntimeException("Login action failed for username: " + username, e);
        }
    }

    public boolean isErrorDisplayed() {
        try {
            return waitForElementVisible(By.xpath("//div[@id='error']")).isDisplayed();
        } catch (RuntimeException e) {
            return false;
        }
    }

    public String getErrorMessageText() {
        try {
            return waitForElementVisible(By.xpath("//div[@id='error']")).getText();
        } catch (RuntimeException e) {
            throw new RuntimeException("Unable to read the login error message", e);
        }
    }

    public boolean isUsernameFieldDisplayed() {
        try {
            return waitForElementVisible(By.xpath("//input[@id='username']")).isDisplayed();
        } catch (RuntimeException e) {
            return false;
        }
    }

    public boolean isPasswordFieldDisplayed() {
        try {
            return waitForElementVisible(By.xpath("//input[@id='password']")).isDisplayed();
        } catch (RuntimeException e) {
            return false;
        }
    }

    public String waitForRedirectAwayFromLogin() {
        try {
            return new WebDriverWait(driver, EXPLICIT_WAIT_SECONDS)
                    .until(ExpectedConditions.or(
                            ExpectedConditions.urlContains(".salesforce.com"),
                            ExpectedConditions.urlContains(".force.com")))
                    .toString();
        } catch (TimeoutException e) {
            String currentUrl = driver.getCurrentUrl();
            throw new RuntimeException("Redirect away from login page timed out. Current URL: " + currentUrl, e);
        }
    }

    public boolean isLoginFieldPresent() {
        try {
            return driver.findElements(By.xpath("//input[@id='username']")).size() > 0;
        } catch (RuntimeException e) {
            throw new RuntimeException("Unable to check presence of login fields", e);
        }
    }

    public boolean getCurrentUrlContainsLoginDomain() {
        try {
            return driver.getCurrentUrl().toLowerCase().contains("login.salesforce.com");
        } catch (RuntimeException e) {
            throw new RuntimeException("Unable to read the current page URL", e);
        }
    }

    public boolean isRememberMeCheckboxSelected() {
        try {
            return waitForElementVisible(By.xpath("//input[@id='rememberUn']")).isSelected();
        } catch (RuntimeException e) {
            throw new RuntimeException("Unable to verify remember me checkbox selection state", e);
        }
    }

    public void scrollToElement(WebElement element) {
        try {
            ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView(true);", element);
        } catch (RuntimeException e) {
            throw new RuntimeException("Failed to scroll to element: " + element, e);
        }
    }
}
